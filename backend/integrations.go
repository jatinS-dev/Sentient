package main

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	providerSlack                  = "slack"
	oauthStateTTL                  = 10 * time.Minute
	maxSignalsInStore              = 500
	maxRawSlackEventsInStore       = 1000
	processedSlackEventRetention   = 72 * time.Hour
	maxSlackWebhookTimestampSkew   = 5 * time.Minute
	defaultSlackConnectionDetail   = "Connect for real-time alerts"
	defaultSlackDisconnectedStatus = "Disconnected"
	defaultSlackBotScopes          = "app_mentions:read,channels:history,channels:read,chat:write,groups:history,groups:read,im:history,im:read,mpim:history,mpim:read,reactions:read,team:read,users:read,users:read.email,files:read"
)

type integrationsResponse struct {
	Integrations []integrationSummary `json:"integrations"`
}

type integrationSummary struct {
	Provider    string `json:"provider"`
	Name        string `json:"name"`
	Status      string `json:"status"`
	Detail      string `json:"detail"`
	ConnectedAt string `json:"connectedAt,omitempty"`
}

type connectURLResponse struct {
	URL string `json:"url"`
}

type signalsResponse struct {
	Signals []signalRecord `json:"signals"`
}

type slackChannelSummary struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	IsPrivate  bool   `json:"isPrivate"`
	IsArchived bool   `json:"isArchived"`
	IsMember   bool   `json:"isMember"`
	NumMembers int    `json:"numMembers,omitempty"`
	Selected   bool   `json:"selected"`
}

type slackChannelsResponse struct {
	Channels      []slackChannelSummary `json:"channels"`
	Total         int                   `json:"total"`
	SelectedCount int                   `json:"selectedCount"`
}

type slackChannelsUpdateRequest struct {
	ChannelIDs []string `json:"channelIds"`
}

type slackChannelImportRequest struct {
	ChannelIDs []string `json:"channelIds"`
}

type slackChannelImportResponse struct {
	Status          string   `json:"status"`
	TotalChannels   int      `json:"totalChannels"`
	ImportedSignals int      `json:"importedSignals"`
	Errors          []string `json:"errors,omitempty"`
}

type slackSetupUpsertRequest struct {
	ClientID      string `json:"clientId"`
	ClientSecret  string `json:"clientSecret"`
	SigningSecret string `json:"signingSecret"`
	RedirectURL   string `json:"redirectUrl"`
	BotScopes     string `json:"botScopes"`
	AppUIBaseURL  string `json:"appUIBaseURL"`
}

type slackSetupConfigView struct {
	ClientID          string `json:"clientId"`
	RedirectURL       string `json:"redirectUrl"`
	BotScopes         string `json:"botScopes"`
	AppUIBaseURL      string `json:"appUIBaseURL"`
	HasClientSecret   bool   `json:"hasClientSecret"`
	HasSigningSecret  bool   `json:"hasSigningSecret"`
	UpdatedAt         string `json:"updatedAt,omitempty"`
	SuggestedWebhook  string `json:"suggestedWebhookUrl,omitempty"`
	SuggestedRedirect string `json:"suggestedRedirectUrl,omitempty"`
}

type slackSetupStatusView struct {
	ReadyForConnect bool     `json:"readyForConnect"`
	MissingFields   []string `json:"missingFields"`
	Connected       bool     `json:"connected"`
	Workspace       string   `json:"workspace,omitempty"`
}

type slackSetupResponse struct {
	Config slackSetupConfigView `json:"config"`
	Status slackSetupStatusView `json:"status"`
}

type slackSetupValidateResponse struct {
	ReadyForConnect bool     `json:"readyForConnect"`
	MissingFields   []string `json:"missingFields"`
	Message         string   `json:"message"`
}

type slackConnectionRecord struct {
	TeamID            string    `json:"teamId"`
	TeamName          string    `json:"teamName"`
	BotUserID         string    `json:"botUserId,omitempty"`
	Scope             string    `json:"scope,omitempty"`
	EncryptedBotToken string    `json:"encryptedBotToken"`
	ConnectedAt       time.Time `json:"connectedAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

type oauthStateRecord struct {
	Provider  string    `json:"provider"`
	ExpiresAt time.Time `json:"expiresAt"`
}

type slackSetupPersisted struct {
	ClientID               string    `json:"clientId"`
	RedirectURL            string    `json:"redirectUrl"`
	BotScopes              string    `json:"botScopes"`
	AppUIBaseURL           string    `json:"appUIBaseURL"`
	EncryptedClientSecret  string    `json:"encryptedClientSecret,omitempty"`
	EncryptedSigningSecret string    `json:"encryptedSigningSecret,omitempty"`
	UpdatedAt              time.Time `json:"updatedAt"`
}

type rawSlackEventRecord struct {
	EventID    string          `json:"eventId"`
	TeamID     string          `json:"teamId,omitempty"`
	EventType  string          `json:"eventType"`
	EventTime  int64           `json:"eventTime,omitempty"`
	Payload    json.RawMessage `json:"payload"`
	ReceivedAt time.Time       `json:"receivedAt"`
	Status     string          `json:"status"`
	Error      string          `json:"error,omitempty"`
}

type signalRecord struct {
	ID         string            `json:"id"`
	Source     string            `json:"source"`
	Title      string            `json:"title"`
	Summary    string            `json:"summary"`
	OccurredAt time.Time         `json:"occurredAt"`
	Meta       map[string]string `json:"meta,omitempty"`
}

type supabaseSignalRow struct {
	ID         string            `json:"id"`
	Source     string            `json:"source"`
	Title      string            `json:"title"`
	Summary    string            `json:"summary"`
	OccurredAt time.Time         `json:"occurred_at"`
	Meta       map[string]string `json:"meta"`
}

type integrationStoreData struct {
	SlackConnection       *slackConnectionRecord      `json:"slackConnection,omitempty"`
	SlackSetup            *slackSetupPersisted        `json:"slackSetup,omitempty"`
	SelectedSlackChannels []string                    `json:"selectedSlackChannels,omitempty"`
	OAuthStates           map[string]oauthStateRecord `json:"oauthStates"`
	ProcessedSlackEvent   map[string]time.Time        `json:"processedSlackEvent"`
	RawSlackEvents        []rawSlackEventRecord       `json:"rawSlackEvents"`
	Signals               []signalRecord              `json:"signals"`
}

type slackRuntimeConfig struct {
	ClientID      string
	ClientSecret  string
	SigningSecret string
	RedirectURL   string
	BotScopes     string
	AppUIBaseURL  string
}

type integrationStore struct {
	mu       sync.Mutex
	path     string
	data     integrationStoreData
	supabase *supabaseSignalStore
}

type supabaseSignalStore struct {
	endpoint   string
	table      string
	serviceKey string
	client     *http.Client
}

type tokenCipher struct {
	aead cipher.AEAD
}

type slackOAuthAccessResponse struct {
	OK          bool   `json:"ok"`
	Error       string `json:"error"`
	AccessToken string `json:"access_token"`
	Scope       string `json:"scope"`
	BotUserID   string `json:"bot_user_id"`
	Team        struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"team"`
}

type slackConversationsListResponse struct {
	OK       bool   `json:"ok"`
	Error    string `json:"error"`
	Channels []struct {
		ID         string `json:"id"`
		Name       string `json:"name"`
		IsPrivate  bool   `json:"is_private"`
		IsArchived bool   `json:"is_archived"`
		IsMember   bool   `json:"is_member"`
		NumMembers int    `json:"num_members"`
	} `json:"channels"`
	ResponseMetadata struct {
		NextCursor string `json:"next_cursor"`
	} `json:"response_metadata"`
}

type slackConversationsHistoryResponse struct {
	OK       bool   `json:"ok"`
	Error    string `json:"error"`
	Messages []struct {
		Type    string `json:"type"`
		Subtype string `json:"subtype"`
		Text    string `json:"text"`
		User    string `json:"user"`
		Ts      string `json:"ts"`
	} `json:"messages"`
	ResponseMetadata struct {
		NextCursor string `json:"next_cursor"`
	} `json:"response_metadata"`
}

type slackWebhookEnvelope struct {
	Type      string          `json:"type"`
	Challenge string          `json:"challenge"`
	EventID   string          `json:"event_id"`
	EventTime int64           `json:"event_time"`
	TeamID    string          `json:"team_id"`
	Event     json.RawMessage `json:"event"`
}

type slackInnerEvent struct {
	Type    string `json:"type"`
	Subtype string `json:"subtype"`
	Text    string `json:"text"`
	User    string `json:"user"`
	Channel string `json:"channel"`
	Ts      string `json:"ts"`
}

var (
	integrationStoreInstance *integrationStore
	integrationTokenCipher   *tokenCipher
)

func initIntegrations() error {
	store, err := newIntegrationStore(integrationsStatePath)
	if err != nil {
		return err
	}
	integrationStoreInstance = store

	if integrationsEncryptKey == "" {
		return nil
	}

	tokenCipher, err := newTokenCipher(integrationsEncryptKey)
	if err != nil {
		return err
	}
	integrationTokenCipher = tokenCipher
	return nil
}

func newIntegrationStore(path string) (*integrationStore, error) {
	if path == "" {
		return nil, errors.New("integration store path is empty")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("create integrations dir: %w", err)
	}

	s := &integrationStore{
		path: path,
		data: integrationStoreData{
			OAuthStates:         map[string]oauthStateRecord{},
			ProcessedSlackEvent: map[string]time.Time{},
			RawSlackEvents:      []rawSlackEventRecord{},
			Signals:             []signalRecord{},
		},
	}
	supabaseSignals, err := newSupabaseSignalStore(supabaseURL, supabaseServiceRoleKey, supabaseSignalsTable)
	if err != nil {
		log.Printf("WARNING: Supabase signals persistence disabled: %v", err)
	} else if supabaseSignals != nil {
		s.supabase = supabaseSignals
		log.Printf("INFO: Supabase signals persistence enabled (table: %s)", supabaseSignals.table)
	}

	content, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			if err := s.persistLocked(); err != nil {
				return nil, err
			}
			return s, nil
		}
		return nil, fmt.Errorf("read integrations state: %w", err)
	}

	if len(content) == 0 {
		if err := s.persistLocked(); err != nil {
			return nil, err
		}
		return s, nil
	}

	if err := json.Unmarshal(content, &s.data); err != nil {
		return nil, fmt.Errorf("parse integrations state: %w", err)
	}
	if s.data.OAuthStates == nil {
		s.data.OAuthStates = map[string]oauthStateRecord{}
	}
	if s.data.ProcessedSlackEvent == nil {
		s.data.ProcessedSlackEvent = map[string]time.Time{}
	}
	if s.data.RawSlackEvents == nil {
		s.data.RawSlackEvents = []rawSlackEventRecord{}
	}
	if s.data.Signals == nil {
		s.data.Signals = []signalRecord{}
	}
	if s.data.SelectedSlackChannels == nil {
		s.data.SelectedSlackChannels = []string{}
	}
	s.cleanupLocked(time.Now().UTC())
	if err := s.persistLocked(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *integrationStore) persistLocked() error {
	blob, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal integrations state: %w", err)
	}
	if err := os.WriteFile(s.path, blob, 0o600); err != nil {
		return fmt.Errorf("write integrations state: %w", err)
	}
	return nil
}

func (s *integrationStore) cleanupLocked(now time.Time) {
	for state, record := range s.data.OAuthStates {
		if now.After(record.ExpiresAt) {
			delete(s.data.OAuthStates, state)
		}
	}
	for eventID, processedAt := range s.data.ProcessedSlackEvent {
		if now.Sub(processedAt) > processedSlackEventRetention {
			delete(s.data.ProcessedSlackEvent, eventID)
		}
	}
	if len(s.data.RawSlackEvents) > maxRawSlackEventsInStore {
		s.data.RawSlackEvents = append([]rawSlackEventRecord{}, s.data.RawSlackEvents[len(s.data.RawSlackEvents)-maxRawSlackEventsInStore:]...)
	}
	if len(s.data.Signals) > maxSignalsInStore {
		s.data.Signals = append([]signalRecord{}, s.data.Signals[len(s.data.Signals)-maxSignalsInStore:]...)
	}
}

func (s *integrationStore) CreateOAuthState(provider string, ttl time.Duration) (string, error) {
	state, err := randomHex(24)
	if err != nil {
		return "", err
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	s.cleanupLocked(now)
	s.data.OAuthStates[state] = oauthStateRecord{
		Provider:  provider,
		ExpiresAt: now.Add(ttl),
	}
	if err := s.persistLocked(); err != nil {
		return "", err
	}
	return state, nil
}

func (s *integrationStore) ConsumeOAuthState(state string, provider string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	s.cleanupLocked(now)
	record, ok := s.data.OAuthStates[state]
	if !ok {
		return false
	}
	if record.Provider != provider || now.After(record.ExpiresAt) {
		delete(s.data.OAuthStates, state)
		_ = s.persistLocked()
		return false
	}

	delete(s.data.OAuthStates, state)
	_ = s.persistLocked()
	return true
}

func (s *integrationStore) UpsertSlackConnection(connection slackConnectionRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.data.SlackConnection = &connection
	s.cleanupLocked(time.Now().UTC())
	return s.persistLocked()
}

func (s *integrationStore) GetSlackSetup() (slackSetupPersisted, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.data.SlackSetup == nil {
		return slackSetupPersisted{}, false
	}
	return *s.data.SlackSetup, true
}

func (s *integrationStore) UpsertSlackSetup(setup slackSetupPersisted) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.data.SlackSetup = &setup
	s.cleanupLocked(time.Now().UTC())
	return s.persistLocked()
}

func (s *integrationStore) GetSlackConnection() (slackConnectionRecord, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.data.SlackConnection == nil {
		return slackConnectionRecord{}, false
	}
	return *s.data.SlackConnection, true
}

func (s *integrationStore) DisconnectSlack() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.SlackConnection = nil
	s.data.SelectedSlackChannels = []string{}
	s.cleanupLocked(time.Now().UTC())
	return s.persistLocked()
}

func (s *integrationStore) GetSelectedSlackChannels() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.data.SelectedSlackChannels...)
}

func (s *integrationStore) SetSelectedSlackChannels(channelIDs []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.SelectedSlackChannels = append([]string(nil), channelIDs...)
	s.cleanupLocked(time.Now().UTC())
	return s.persistLocked()
}

func (s *integrationStore) RecordSlackEvent(envelope slackWebhookEnvelope, payload []byte) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	s.cleanupLocked(now)
	if _, exists := s.data.ProcessedSlackEvent[envelope.EventID]; exists {
		return false, nil
	}
	s.data.ProcessedSlackEvent[envelope.EventID] = now
	s.data.RawSlackEvents = append(s.data.RawSlackEvents, rawSlackEventRecord{
		EventID:    envelope.EventID,
		TeamID:     envelope.TeamID,
		EventType:  envelope.Type,
		EventTime:  envelope.EventTime,
		Payload:    append([]byte(nil), payload...),
		ReceivedAt: now,
		Status:     "pending",
	})
	s.cleanupLocked(now)
	if err := s.persistLocked(); err != nil {
		return false, err
	}
	return true, nil
}

func (s *integrationStore) UpdateSlackEventStatus(eventID string, status string, eventErr string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i := len(s.data.RawSlackEvents) - 1; i >= 0; i-- {
		if s.data.RawSlackEvents[i].EventID == eventID {
			s.data.RawSlackEvents[i].Status = status
			s.data.RawSlackEvents[i].Error = eventErr
			break
		}
	}
	_ = s.persistLocked()
}

func (s *integrationStore) SlackEventCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.data.RawSlackEvents)
}

func (s *integrationStore) AddSignal(signal signalRecord) error {
	if s.supabase != nil {
		if err := s.supabase.UpsertSignal(signal); err != nil {
			return err
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for idx := range s.data.Signals {
		if s.data.Signals[idx].ID == signal.ID {
			s.data.Signals[idx] = signal
			s.cleanupLocked(time.Now().UTC())
			return s.persistLocked()
		}
	}

	s.data.Signals = append(s.data.Signals, signal)
	s.cleanupLocked(time.Now().UTC())
	return s.persistLocked()
}

func (s *integrationStore) ListSignals(source string, limit int) []signalRecord {
	if s.supabase != nil {
		signals, err := s.supabase.ListSignals(source, limit)
		if err == nil {
			return signals
		}
		log.Printf("WARNING: failed to read signals from Supabase, falling back to local store: %v", err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if limit <= 0 {
		limit = 20
	}
	items := make([]signalRecord, 0, limit)
	for i := len(s.data.Signals) - 1; i >= 0; i-- {
		candidate := s.data.Signals[i]
		if source != "" && !strings.EqualFold(candidate.Source, source) {
			continue
		}
		items = append(items, candidate)
		if len(items) >= limit {
			break
		}
	}
	slices.Reverse(items)
	return items
}

func newSupabaseSignalStore(projectURL string, serviceRoleKey string, table string) (*supabaseSignalStore, error) {
	projectURL = strings.TrimSpace(projectURL)
	serviceRoleKey = strings.TrimSpace(serviceRoleKey)
	table = strings.TrimSpace(table)
	if projectURL == "" && serviceRoleKey == "" {
		return nil, nil
	}
	if projectURL == "" || serviceRoleKey == "" {
		return nil, errors.New("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set")
	}
	if table == "" {
		table = "signals"
	}

	base := strings.TrimSuffix(projectURL, "/")
	if !strings.HasSuffix(base, "/rest/v1") {
		base += "/rest/v1"
	}
	parsed, err := url.Parse(base)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return nil, errors.New("SUPABASE_URL must be a valid absolute URL")
	}

	return &supabaseSignalStore{
		endpoint:   base,
		table:      table,
		serviceKey: serviceRoleKey,
		client:     &http.Client{Timeout: 15 * time.Second},
	}, nil
}

func (s *supabaseSignalStore) UpsertSignal(signal signalRecord) error {
	if signal.OccurredAt.IsZero() {
		signal.OccurredAt = time.Now().UTC()
	}
	row := supabaseSignalRow{
		ID:         strings.TrimSpace(signal.ID),
		Source:     strings.TrimSpace(signal.Source),
		Title:      strings.TrimSpace(signal.Title),
		Summary:    strings.TrimSpace(signal.Summary),
		OccurredAt: signal.OccurredAt.UTC(),
		Meta:       signal.Meta,
	}
	if row.ID == "" {
		return errors.New("signal id is required")
	}
	if row.Source == "" {
		row.Source = "Unknown"
	}
	if row.Meta == nil {
		row.Meta = map[string]string{}
	}

	payload, err := json.Marshal([]supabaseSignalRow{row})
	if err != nil {
		return err
	}

	reqURL := fmt.Sprintf("%s/%s?on_conflict=id", s.endpoint, s.table)
	req, err := http.NewRequest(http.MethodPost, reqURL, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("apikey", s.serviceKey)
	req.Header.Set("Authorization", "Bearer "+s.serviceKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Prefer", "resolution=merge-duplicates,return=minimal")

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("supabase upsert failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return nil
}

func (s *supabaseSignalStore) ListSignals(source string, limit int) ([]signalRecord, error) {
	if limit <= 0 {
		limit = 20
	}
	values := url.Values{}
	values.Set("select", "id,source,title,summary,occurred_at,meta")
	values.Set("order", "occurred_at.desc")
	values.Set("limit", strconv.Itoa(limit))
	if trimmed := strings.TrimSpace(source); trimmed != "" {
		values.Set("source", "eq."+trimmed)
	}

	reqURL := fmt.Sprintf("%s/%s?%s", s.endpoint, s.table, values.Encode())
	req, err := http.NewRequest(http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", s.serviceKey)
	req.Header.Set("Authorization", "Bearer "+s.serviceKey)
	req.Header.Set("Accept", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("supabase select failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var rows []supabaseSignalRow
	if err := json.Unmarshal(body, &rows); err != nil {
		return nil, err
	}

	signals := make([]signalRecord, 0, len(rows))
	for _, row := range rows {
		signals = append(signals, signalRecord{
			ID:         row.ID,
			Source:     row.Source,
			Title:      row.Title,
			Summary:    row.Summary,
			OccurredAt: row.OccurredAt,
			Meta:       row.Meta,
		})
	}
	slices.Reverse(signals)
	return signals, nil
}

func newTokenCipher(secret string) (*tokenCipher, error) {
	derived := sha256.Sum256([]byte(secret))
	block, err := aes.NewCipher(derived[:])
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &tokenCipher{aead: aead}, nil
}

func (c *tokenCipher) Encrypt(plain string) (string, error) {
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	ciphertext := c.aead.Seal(nil, nonce, []byte(plain), nil)
	return base64.StdEncoding.EncodeToString(append(nonce, ciphertext...)), nil
}

func (c *tokenCipher) Decrypt(ciphertext string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return "", err
	}
	nonceSize := c.aead.NonceSize()
	if len(raw) < nonceSize {
		return "", errors.New("invalid ciphertext")
	}
	nonce, payload := raw[:nonceSize], raw[nonceSize:]
	plain, err := c.aead.Open(nil, nonce, payload, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

func randomHex(bytesLen int) (string, error) {
	buf := make([]byte, bytesLen)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func inferRequestBaseURL(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if forwardedProto := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")); forwardedProto != "" {
		scheme = strings.TrimSpace(strings.Split(forwardedProto, ",")[0])
	}

	host := strings.TrimSpace(r.Host)
	if forwardedHost := strings.TrimSpace(r.Header.Get("X-Forwarded-Host")); forwardedHost != "" {
		host = strings.TrimSpace(strings.Split(forwardedHost, ",")[0])
	}
	if host == "" {
		host = "localhost:8080"
	}

	return fmt.Sprintf("%s://%s", scheme, host)
}

func inferredSlackRedirectURL(r *http.Request) string {
	return inferRequestBaseURL(r) + "/api/integrations/slack/callback"
}

func inferredSlackWebhookURL(r *http.Request) string {
	return inferRequestBaseURL(r) + "/api/integrations/slack/webhook"
}

func inferredAppUIBaseURL(r *http.Request) string {
	if origin := strings.TrimSpace(r.Header.Get("Origin")); origin != "" {
		if parsed, err := url.Parse(origin); err == nil && parsed.Scheme != "" && parsed.Host != "" {
			parsed.Path = "/app/integration/slack"
			parsed.RawQuery = ""
			parsed.Fragment = ""
			return parsed.String()
		}
	}
	return "http://localhost:4200/app/integration/slack"
}

func ensureIntegrationEncryptionKey(path string) (string, error) {
	if strings.TrimSpace(path) == "" {
		return "", errors.New("encryption key path is empty")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", fmt.Errorf("create encryption key dir: %w", err)
	}

	existing, err := os.ReadFile(path)
	if err == nil {
		key := strings.TrimSpace(string(existing))
		if key != "" {
			return key, nil
		}
	}
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("read encryption key file: %w", err)
	}

	key, err := randomHex(32)
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(path, []byte(key), 0o600); err != nil {
		return "", fmt.Errorf("write encryption key file: %w", err)
	}
	return key, nil
}

func currentSlackRuntimeConfig() (slackRuntimeConfig, error) {
	cfg := slackRuntimeConfig{
		ClientID:      strings.TrimSpace(slackClientID),
		ClientSecret:  strings.TrimSpace(slackClientSecret),
		SigningSecret: strings.TrimSpace(slackSigningSecret),
		RedirectURL:   strings.TrimSpace(slackRedirectURL),
		BotScopes:     strings.TrimSpace(slackBotScopes),
		AppUIBaseURL:  strings.TrimSpace(appUIBaseURL),
	}
	if cfg.BotScopes == "" {
		cfg.BotScopes = defaultSlackBotScopes
	}

	setup, ok := integrationStoreInstance.GetSlackSetup()
	if !ok {
		return cfg, nil
	}
	if strings.TrimSpace(setup.ClientID) != "" {
		cfg.ClientID = strings.TrimSpace(setup.ClientID)
	}
	if strings.TrimSpace(cfg.RedirectURL) == "" && strings.TrimSpace(setup.RedirectURL) != "" {
		cfg.RedirectURL = strings.TrimSpace(setup.RedirectURL)
	}
	if strings.TrimSpace(setup.BotScopes) != "" {
		cfg.BotScopes = strings.TrimSpace(setup.BotScopes)
	}
	if strings.TrimSpace(cfg.AppUIBaseURL) == "" && strings.TrimSpace(setup.AppUIBaseURL) != "" {
		cfg.AppUIBaseURL = strings.TrimSpace(setup.AppUIBaseURL)
	}
	if integrationTokenCipher != nil {
		if strings.TrimSpace(setup.EncryptedClientSecret) != "" {
			decrypted, err := integrationTokenCipher.Decrypt(setup.EncryptedClientSecret)
			if err != nil {
				return slackRuntimeConfig{}, fmt.Errorf("decrypt slack client secret: %w", err)
			}
			cfg.ClientSecret = strings.TrimSpace(decrypted)
		}
		if strings.TrimSpace(setup.EncryptedSigningSecret) != "" {
			decrypted, err := integrationTokenCipher.Decrypt(setup.EncryptedSigningSecret)
			if err != nil {
				return slackRuntimeConfig{}, fmt.Errorf("decrypt slack signing secret: %w", err)
			}
			cfg.SigningSecret = strings.TrimSpace(decrypted)
		}
	}
	return cfg, nil
}

func slackMissingFields(cfg slackRuntimeConfig) []string {
	missing := make([]string, 0, 4)
	if strings.TrimSpace(cfg.ClientID) == "" {
		missing = append(missing, "clientId")
	}
	if strings.TrimSpace(cfg.ClientSecret) == "" {
		missing = append(missing, "clientSecret")
	}
	if strings.TrimSpace(cfg.SigningSecret) == "" {
		missing = append(missing, "signingSecret")
	}
	return missing
}

func getSlackBotToken() (string, error) {
	conn, connected := integrationStoreInstance.GetSlackConnection()
	if !connected {
		return "", errors.New("slack is not connected")
	}
	if integrationTokenCipher == nil {
		return "", errors.New("integration encryption is not configured")
	}
	token, err := integrationTokenCipher.Decrypt(conn.EncryptedBotToken)
	if err != nil {
		return "", fmt.Errorf("failed to decrypt Slack token: %w", err)
	}
	token = strings.TrimSpace(token)
	if token == "" {
		return "", errors.New("slack token is empty")
	}
	return token, nil
}

func fetchSlackChannels(token string) ([]slackChannelSummary, error) {
	channels := make([]slackChannelSummary, 0, 64)
	cursor := ""

	for {
		endpoint := "https://slack.com/api/conversations.list"
		req, err := http.NewRequest(http.MethodGet, endpoint, nil)
		if err != nil {
			return nil, err
		}
		query := req.URL.Query()
		query.Set("limit", "200")
		query.Set("types", "public_channel,private_channel")
		query.Set("exclude_archived", "true")
		query.Set("include_num_members", "true")
		if cursor != "" {
			query.Set("cursor", cursor)
		}
		req.URL.RawQuery = query.Encode()
		req.Header.Set("Authorization", "Bearer "+token)

		client := &http.Client{Timeout: 20 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}

		body, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			return nil, readErr
		}

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return nil, fmt.Errorf("slack conversations.list status %d", resp.StatusCode)
		}

		var parsed slackConversationsListResponse
		if err := json.Unmarshal(body, &parsed); err != nil {
			return nil, err
		}
		if !parsed.OK {
			return nil, fmt.Errorf("slack conversations.list error: %s", parsed.Error)
		}

		for _, ch := range parsed.Channels {
			if strings.TrimSpace(ch.ID) == "" || strings.TrimSpace(ch.Name) == "" {
				continue
			}
			channels = append(channels, slackChannelSummary{
				ID:         ch.ID,
				Name:       ch.Name,
				IsPrivate:  ch.IsPrivate,
				IsArchived: ch.IsArchived,
				IsMember:   ch.IsMember,
				NumMembers: ch.NumMembers,
			})
		}

		cursor = strings.TrimSpace(parsed.ResponseMetadata.NextCursor)
		if cursor == "" {
			break
		}
	}

	slices.SortFunc(channels, func(a, b slackChannelSummary) int {
		return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
	})
	return channels, nil
}

func fetchSlackChannelMessages(token string, channelID string) ([]struct {
	Type    string `json:"type"`
	Subtype string `json:"subtype"`
	Text    string `json:"text"`
	User    string `json:"user"`
	Ts      string `json:"ts"`
}, error) {
	messages := make([]struct {
		Type    string `json:"type"`
		Subtype string `json:"subtype"`
		Text    string `json:"text"`
		User    string `json:"user"`
		Ts      string `json:"ts"`
	}, 0, 256)
	cursor := ""

	for {
		endpoint := "https://slack.com/api/conversations.history"
		req, err := http.NewRequest(http.MethodGet, endpoint, nil)
		if err != nil {
			return nil, err
		}
		query := req.URL.Query()
		query.Set("channel", channelID)
		query.Set("limit", "200")
		if cursor != "" {
			query.Set("cursor", cursor)
		}
		req.URL.RawQuery = query.Encode()
		req.Header.Set("Authorization", "Bearer "+token)

		client := &http.Client{Timeout: 25 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		body, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			return nil, readErr
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return nil, fmt.Errorf("slack conversations.history status %d for channel %s", resp.StatusCode, channelID)
		}

		var parsed slackConversationsHistoryResponse
		if err := json.Unmarshal(body, &parsed); err != nil {
			return nil, err
		}
		if !parsed.OK {
			return nil, fmt.Errorf("slack conversations.history error for channel %s: %s", channelID, parsed.Error)
		}

		messages = append(messages, parsed.Messages...)
		cursor = strings.TrimSpace(parsed.ResponseMetadata.NextCursor)
		if cursor == "" {
			break
		}
	}

	return messages, nil
}

func truncateText(text string, max int) string {
	if max <= 0 {
		return ""
	}
	runes := []rune(text)
	if len(runes) <= max {
		return text
	}
	return string(runes[:max]) + "..."
}

func suggestedSlackWebhookURL(r *http.Request, cfg slackRuntimeConfig) string {
	redirect := strings.TrimSpace(cfg.RedirectURL)
	if redirect == "" {
		return inferredSlackWebhookURL(r)
	}
	parsed, err := url.Parse(redirect)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return inferredSlackWebhookURL(r)
	}
	parsed.Path = "/api/integrations/slack/webhook"
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String()
}

func buildSlackSetupResponse(r *http.Request) (slackSetupResponse, error) {
	cfg, err := currentSlackRuntimeConfig()
	if err != nil {
		return slackSetupResponse{}, err
	}
	if strings.TrimSpace(cfg.RedirectURL) == "" {
		cfg.RedirectURL = inferredSlackRedirectURL(r)
	}
	if strings.TrimSpace(cfg.AppUIBaseURL) == "" {
		cfg.AppUIBaseURL = inferredAppUIBaseURL(r)
	}
	if strings.TrimSpace(cfg.BotScopes) == "" {
		cfg.BotScopes = defaultSlackBotScopes
	}
	setup, hasSetup := integrationStoreInstance.GetSlackSetup()
	missing := slackMissingFields(cfg)

	resp := slackSetupResponse{
		Config: slackSetupConfigView{
			ClientID:          cfg.ClientID,
			RedirectURL:       cfg.RedirectURL,
			BotScopes:         cfg.BotScopes,
			AppUIBaseURL:      cfg.AppUIBaseURL,
			HasClientSecret:   strings.TrimSpace(cfg.ClientSecret) != "",
			HasSigningSecret:  strings.TrimSpace(cfg.SigningSecret) != "",
			SuggestedWebhook:  suggestedSlackWebhookURL(r, cfg),
			SuggestedRedirect: cfg.RedirectURL,
		},
		Status: slackSetupStatusView{
			ReadyForConnect: len(missing) == 0,
			MissingFields:   missing,
		},
	}

	if hasSetup {
		resp.Config.UpdatedAt = setup.UpdatedAt.Format(time.RFC3339)
	}
	if conn, ok := integrationStoreInstance.GetSlackConnection(); ok {
		resp.Status.Connected = true
		resp.Status.Workspace = conn.TeamName
	}
	return resp, nil
}

func handleSlackSetup(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		resp, err := buildSlackSetupResponse(r)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to read slack setup"})
			return
		}
		writeJSON(w, http.StatusOK, resp)
	case http.MethodPost:
		handleSlackSetupSave(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleSlackSetupSave(w http.ResponseWriter, r *http.Request) {
	if integrationTokenCipher == nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "integration encryption is not configured"})
		return
	}

	var req slackSetupUpsertRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid json"})
		return
	}

	req.ClientID = strings.TrimSpace(req.ClientID)
	req.ClientSecret = strings.TrimSpace(req.ClientSecret)
	req.SigningSecret = strings.TrimSpace(req.SigningSecret)
	req.RedirectURL = strings.TrimSpace(req.RedirectURL)
	req.BotScopes = strings.TrimSpace(req.BotScopes)
	req.AppUIBaseURL = strings.TrimSpace(req.AppUIBaseURL)

	existing, _ := integrationStoreInstance.GetSlackSetup()

	if req.RedirectURL == "" {
		if strings.TrimSpace(existing.RedirectURL) != "" {
			req.RedirectURL = existing.RedirectURL
		} else {
			req.RedirectURL = inferredSlackRedirectURL(r)
		}
	}
	if req.BotScopes == "" {
		if strings.TrimSpace(existing.BotScopes) != "" {
			req.BotScopes = existing.BotScopes
		} else {
			req.BotScopes = defaultSlackBotScopes
		}
	}
	if req.AppUIBaseURL == "" {
		req.AppUIBaseURL = inferredAppUIBaseURL(r)
	}
	if _, err := url.ParseRequestURI(req.RedirectURL); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "redirectUrl must be a valid absolute URL"})
		return
	}
	if _, err := url.ParseRequestURI(req.AppUIBaseURL); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "appUIBaseURL must be a valid absolute URL"})
		return
	}

	setup := slackSetupPersisted{
		ClientID:     req.ClientID,
		RedirectURL:  req.RedirectURL,
		BotScopes:    req.BotScopes,
		AppUIBaseURL: req.AppUIBaseURL,
		UpdatedAt:    time.Now().UTC(),
	}

	if req.ClientSecret != "" {
		enc, err := integrationTokenCipher.Encrypt(req.ClientSecret)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to encrypt client secret"})
			return
		}
		setup.EncryptedClientSecret = enc
	} else {
		setup.EncryptedClientSecret = existing.EncryptedClientSecret
	}

	if req.SigningSecret != "" {
		enc, err := integrationTokenCipher.Encrypt(req.SigningSecret)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to encrypt signing secret"})
			return
		}
		setup.EncryptedSigningSecret = enc
	} else {
		setup.EncryptedSigningSecret = existing.EncryptedSigningSecret
	}

	if err := integrationStoreInstance.UpsertSlackSetup(setup); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to store slack setup"})
		return
	}

	resp, err := buildSlackSetupResponse(r)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to read slack setup"})
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func handleSlackSetupValidate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	cfg, err := currentSlackRuntimeConfig()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to resolve Slack setup"})
		return
	}
	if strings.TrimSpace(cfg.RedirectURL) == "" {
		cfg.RedirectURL = inferredSlackRedirectURL(r)
	}
	if strings.TrimSpace(cfg.AppUIBaseURL) == "" {
		cfg.AppUIBaseURL = inferredAppUIBaseURL(r)
	}
	missing := slackMissingFields(cfg)
	ready := len(missing) == 0
	message := "Slack setup is ready. You can connect a workspace from Integrations."
	if !ready {
		message = "Slack setup is incomplete. Fill missing fields in the setup form."
	}
	writeJSON(w, http.StatusOK, slackSetupValidateResponse{
		ReadyForConnect: ready,
		MissingFields:   missing,
		Message:         message,
	})
}

func handleIntegrations(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	slackSummary := integrationSummary{
		Provider: providerSlack,
		Name:     "Slack",
		Status:   defaultSlackDisconnectedStatus,
		Detail:   defaultSlackConnectionDetail,
	}

	if conn, ok := integrationStoreInstance.GetSlackConnection(); ok {
		slackSummary.Status = "Connected"
		slackSummary.ConnectedAt = conn.ConnectedAt.Format(time.RFC3339)
		eventCount := integrationStoreInstance.SlackEventCount()
		selectedCount := len(integrationStoreInstance.GetSelectedSlackChannels())
		slackSummary.Detail = fmt.Sprintf("%s workspace connected (%d selected channels, %d events received)", conn.TeamName, selectedCount, eventCount)
	}

	writeJSON(w, http.StatusOK, integrationsResponse{
		Integrations: []integrationSummary{slackSummary},
	})
}

func handleSlackConnectURL(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	cfg, err := currentSlackRuntimeConfig()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to resolve Slack setup"})
		return
	}
	if strings.TrimSpace(cfg.RedirectURL) == "" {
		cfg.RedirectURL = inferredSlackRedirectURL(r)
	}
	if strings.TrimSpace(cfg.AppUIBaseURL) == "" {
		cfg.AppUIBaseURL = inferredAppUIBaseURL(r)
	}
	if err := validateSlackConnectConfig(cfg); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}

	state, err := integrationStoreInstance.CreateOAuthState(providerSlack, oauthStateTTL)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "unable to create oauth state"})
		return
	}

	values := url.Values{}
	values.Set("client_id", cfg.ClientID)
	scopes := strings.TrimSpace(cfg.BotScopes)
	if strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("access")), "full") || scopes == "" {
		scopes = defaultSlackBotScopes
	}
	values.Set("scope", scopes)
	values.Set("redirect_uri", cfg.RedirectURL)
	values.Set("state", state)
	connectURL := "https://slack.com/oauth/v2/authorize?" + values.Encode()
	writeJSON(w, http.StatusOK, connectURLResponse{URL: connectURL})
}

func validateSlackConnectConfig(cfg slackRuntimeConfig) error {
	missing := make([]string, 0, 5)
	if strings.TrimSpace(cfg.ClientID) == "" {
		missing = append(missing, "clientId")
	}
	if strings.TrimSpace(cfg.ClientSecret) == "" {
		missing = append(missing, "clientSecret")
	}
	if strings.TrimSpace(cfg.SigningSecret) == "" {
		missing = append(missing, "signingSecret")
	}
	if strings.TrimSpace(cfg.RedirectURL) == "" {
		missing = append(missing, "redirectUrl")
	}
	if integrationTokenCipher == nil {
		missing = append(missing, "integrationEncryption")
	}
	if len(missing) > 0 {
		return fmt.Errorf("missing required Slack setup fields: %s", strings.Join(missing, ", "))
	}
	return nil
}

func handleSlackCallback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	cfg, cfgErr := currentSlackRuntimeConfig()
	if cfgErr != nil {
		redirectIntegrationResult(w, r, appUIBaseURL, providerSlack, "error", "Slack setup is invalid")
		return
	}
	if strings.TrimSpace(cfg.RedirectURL) == "" {
		cfg.RedirectURL = inferredSlackRedirectURL(r)
	}
	if strings.TrimSpace(cfg.AppUIBaseURL) == "" {
		cfg.AppUIBaseURL = inferredAppUIBaseURL(r)
	}

	slackErr := strings.TrimSpace(r.URL.Query().Get("error"))
	if slackErr != "" {
		redirectIntegrationResult(w, r, cfg.AppUIBaseURL, providerSlack, "error", "Slack auth was denied: "+slackErr)
		return
	}

	state := strings.TrimSpace(r.URL.Query().Get("state"))
	code := strings.TrimSpace(r.URL.Query().Get("code"))
	if state == "" || code == "" {
		redirectIntegrationResult(w, r, cfg.AppUIBaseURL, providerSlack, "error", "Missing OAuth state or code")
		return
	}
	if !integrationStoreInstance.ConsumeOAuthState(state, providerSlack) {
		redirectIntegrationResult(w, r, cfg.AppUIBaseURL, providerSlack, "error", "Invalid or expired OAuth state")
		return
	}

	access, err := exchangeSlackOAuthCode(code, cfg)
	if err != nil {
		log.Printf("slack oauth exchange failed: %v", err)
		redirectIntegrationResult(w, r, cfg.AppUIBaseURL, providerSlack, "error", "Failed to complete Slack OAuth")
		return
	}
	if access.AccessToken == "" || access.Team.ID == "" {
		redirectIntegrationResult(w, r, cfg.AppUIBaseURL, providerSlack, "error", "Slack OAuth returned incomplete data")
		return
	}

	encryptedToken, err := integrationTokenCipher.Encrypt(access.AccessToken)
	if err != nil {
		log.Printf("slack token encryption failed: %v", err)
		redirectIntegrationResult(w, r, cfg.AppUIBaseURL, providerSlack, "error", "Failed to secure Slack token")
		return
	}

	now := time.Now().UTC()
	connection := slackConnectionRecord{
		TeamID:            access.Team.ID,
		TeamName:          access.Team.Name,
		BotUserID:         access.BotUserID,
		Scope:             access.Scope,
		EncryptedBotToken: encryptedToken,
		ConnectedAt:       now,
		UpdatedAt:         now,
	}
	if err := integrationStoreInstance.UpsertSlackConnection(connection); err != nil {
		log.Printf("failed to save slack connection: %v", err)
		redirectIntegrationResult(w, r, cfg.AppUIBaseURL, providerSlack, "error", "Failed to store Slack connection")
		return
	}

	redirectIntegrationResult(w, r, cfg.AppUIBaseURL, providerSlack, "connected", "Slack workspace connected")
}

func exchangeSlackOAuthCode(code string, cfg slackRuntimeConfig) (*slackOAuthAccessResponse, error) {
	form := url.Values{}
	form.Set("client_id", cfg.ClientID)
	form.Set("client_secret", cfg.ClientSecret)
	form.Set("code", code)
	form.Set("redirect_uri", cfg.RedirectURL)

	req, err := http.NewRequest(http.MethodPost, "https://slack.com/api/oauth.v2.access", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 12 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var parsed slackOAuthAccessResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	if !parsed.OK {
		return nil, fmt.Errorf("slack oauth error: %s", parsed.Error)
	}
	return &parsed, nil
}

func redirectIntegrationResult(w http.ResponseWriter, r *http.Request, appBaseURL string, provider string, status string, message string) {
	target, err := url.Parse(appBaseURL)
	if err != nil || target.Scheme == "" || target.Host == "" {
		target = &url.URL{
			Scheme: "http",
			Host:   "localhost:4200",
			Path:   "/app",
		}
	}
	q := target.Query()
	q.Set("integration", provider)
	q.Set("status", status)
	if message != "" {
		q.Set("message", message)
	}
	target.RawQuery = q.Encode()
	http.Redirect(w, r, target.String(), http.StatusFound)
}

func handleSlackDisconnect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	conn, connected := integrationStoreInstance.GetSlackConnection()
	if connected && integrationTokenCipher != nil {
		if token, err := integrationTokenCipher.Decrypt(conn.EncryptedBotToken); err == nil && token != "" {
			if err := revokeSlackToken(token); err != nil {
				log.Printf("slack revoke token failed: %v", err)
			}
		}
	}

	if err := integrationStoreInstance.DisconnectSlack(); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to disconnect Slack"})
		return
	}
	writeJSON(w, http.StatusOK, okResponse{Status: "ok"})
}

func handleSlackChannels(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		handleSlackChannelsList(w, r)
	case http.MethodPut:
		handleSlackChannelsUpdate(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleSlackChannelsList(w http.ResponseWriter, r *http.Request) {
	token, err := getSlackBotToken()
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}

	channels, err := fetchSlackChannels(token)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResponse{Error: err.Error()})
		return
	}

	selectedIDs := integrationStoreInstance.GetSelectedSlackChannels()
	selectedSet := make(map[string]struct{}, len(selectedIDs))
	for _, id := range selectedIDs {
		selectedSet[id] = struct{}{}
	}

	selectedCount := 0
	for idx := range channels {
		if _, ok := selectedSet[channels[idx].ID]; ok {
			channels[idx].Selected = true
			selectedCount++
		}
	}

	writeJSON(w, http.StatusOK, slackChannelsResponse{
		Channels:      channels,
		Total:         len(channels),
		SelectedCount: selectedCount,
	})
}

func handleSlackChannelsUpdate(w http.ResponseWriter, r *http.Request) {
	token, err := getSlackBotToken()
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}

	var req slackChannelsUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid json"})
		return
	}

	channels, err := fetchSlackChannels(token)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResponse{Error: err.Error()})
		return
	}

	available := make(map[string]struct{}, len(channels))
	for _, ch := range channels {
		available[ch.ID] = struct{}{}
	}

	selected := make([]string, 0, len(req.ChannelIDs))
	seen := map[string]struct{}{}
	for _, rawID := range req.ChannelIDs {
		id := strings.TrimSpace(rawID)
		if id == "" {
			continue
		}
		if _, ok := available[id]; !ok {
			continue
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		selected = append(selected, id)
	}

	if err := integrationStoreInstance.SetSelectedSlackChannels(selected); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to save selected channels"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":        "ok",
		"selectedCount": len(selected),
		"channelIds":    selected,
	})
}

func handleSlackChannelsImport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	token, err := getSlackBotToken()
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}

	var req slackChannelImportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid json"})
		return
	}

	selected := req.ChannelIDs
	if len(selected) == 0 {
		selected = integrationStoreInstance.GetSelectedSlackChannels()
	}
	if len(selected) == 0 {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "no channels selected"})
		return
	}

	channelMeta, channelMetaErr := fetchSlackChannels(token)
	channelNameByID := map[string]string{}
	for _, ch := range channelMeta {
		channelNameByID[ch.ID] = ch.Name
	}

	importedSignals := 0
	errorsOut := make([]string, 0)

	for _, channelID := range selected {
		channelID = strings.TrimSpace(channelID)
		if channelID == "" {
			continue
		}

		messages, historyErr := fetchSlackChannelMessages(token, channelID)
		if historyErr != nil {
			errorsOut = append(errorsOut, fmt.Sprintf("%s: %v", channelID, historyErr))
			continue
		}

		channelName := channelNameByID[channelID]
		if channelName == "" {
			channelName = channelID
		}

		for _, msg := range messages {
			if strings.TrimSpace(msg.Ts) == "" {
				continue
			}
			if msg.Subtype == "bot_message" && strings.TrimSpace(msg.Text) == "" {
				continue
			}

			summary := strings.TrimSpace(msg.Text)
			if summary == "" {
				continue
			}

			signal := signalRecord{
				ID:         fmt.Sprintf("slack:%s:%s", channelID, msg.Ts),
				Source:     "Slack",
				Title:      fmt.Sprintf("#%s message", channelName),
				Summary:    truncateText(summary, 500),
				OccurredAt: parseSlackTimestamp(msg.Ts),
				Meta: map[string]string{
					"eventType":   "message",
					"channel":     channelID,
					"channelName": channelName,
					"user":        msg.User,
					"imported":    "true",
				},
			}
			if signal.OccurredAt.IsZero() {
				signal.OccurredAt = time.Now().UTC()
			}
			if addErr := integrationStoreInstance.AddSignal(signal); addErr != nil {
				errorsOut = append(errorsOut, fmt.Sprintf("%s: failed to store message %s", channelID, msg.Ts))
				continue
			}
			importedSignals++
		}
	}

	if channelMetaErr != nil {
		errorsOut = append(errorsOut, "channel metadata refresh failed: "+channelMetaErr.Error())
	}

	writeJSON(w, http.StatusOK, slackChannelImportResponse{
		Status:          "ok",
		TotalChannels:   len(selected),
		ImportedSignals: importedSignals,
		Errors:          errorsOut,
	})
}

func revokeSlackToken(token string) error {
	form := url.Values{}
	form.Set("token", token)

	req, err := http.NewRequest(http.MethodPost, "https://slack.com/api/auth.revoke", strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var payload struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return err
	}
	if !payload.OK {
		return fmt.Errorf("slack auth.revoke failed: %s", payload.Error)
	}
	return nil
}

func handleSlackWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	payload, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "unable to read body"})
		return
	}
	if err := verifySlackSignature(r, payload); err != nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{Error: err.Error()})
		return
	}

	var envelope slackWebhookEnvelope
	if err := json.Unmarshal(payload, &envelope); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid webhook payload"})
		return
	}

	if envelope.Type == "url_verification" {
		writeJSON(w, http.StatusOK, map[string]string{"challenge": envelope.Challenge})
		return
	}
	if envelope.Type != "event_callback" {
		writeJSON(w, http.StatusOK, okResponse{Status: "ignored"})
		return
	}
	if strings.TrimSpace(envelope.EventID) == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "missing event_id"})
		return
	}

	isNew, err := integrationStoreInstance.RecordSlackEvent(envelope, payload)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to persist event"})
		return
	}
	if !isNew {
		writeJSON(w, http.StatusOK, okResponse{Status: "duplicate"})
		return
	}

	go processSlackEvent(envelope)
	writeJSON(w, http.StatusOK, okResponse{Status: "ok"})
}

func verifySlackSignature(r *http.Request, payload []byte) error {
	cfg, err := currentSlackRuntimeConfig()
	if err != nil {
		return errors.New("failed to resolve Slack signing secret")
	}
	if strings.TrimSpace(cfg.SigningSecret) == "" {
		return errors.New("slack signing secret is not configured")
	}

	slackTimestamp := strings.TrimSpace(r.Header.Get("X-Slack-Request-Timestamp"))
	slackSignature := strings.TrimSpace(r.Header.Get("X-Slack-Signature"))
	if slackTimestamp == "" || slackSignature == "" {
		return errors.New("missing Slack signature headers")
	}

	ts, err := strconv.ParseInt(slackTimestamp, 10, 64)
	if err != nil {
		return errors.New("invalid Slack timestamp header")
	}
	requestTime := time.Unix(ts, 0)
	if delta := time.Since(requestTime); delta > maxSlackWebhookTimestampSkew || delta < -maxSlackWebhookTimestampSkew {
		return errors.New("stale Slack request timestamp")
	}

	baseString := "v0:" + slackTimestamp + ":" + string(payload)
	mac := hmac.New(sha256.New, []byte(cfg.SigningSecret))
	_, _ = mac.Write([]byte(baseString))
	expected := "v0=" + hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(slackSignature)) {
		return errors.New("invalid Slack signature")
	}
	return nil
}

func processSlackEvent(envelope slackWebhookEnvelope) {
	var event slackInnerEvent
	if err := json.Unmarshal(envelope.Event, &event); err != nil {
		integrationStoreInstance.UpdateSlackEventStatus(envelope.EventID, "failed", "unable to decode inner event")
		return
	}

	if event.Type == "" {
		integrationStoreInstance.UpdateSlackEventStatus(envelope.EventID, "ignored", "unknown event type")
		return
	}

	if event.Subtype == "bot_message" {
		integrationStoreInstance.UpdateSlackEventStatus(envelope.EventID, "ignored", "bot message")
		return
	}

	selectedChannels := integrationStoreInstance.GetSelectedSlackChannels()
	if len(selectedChannels) == 0 {
		integrationStoreInstance.UpdateSlackEventStatus(envelope.EventID, "ignored", "no channels selected")
		return
	}
	allowed := false
	for _, channelID := range selectedChannels {
		if channelID == event.Channel {
			allowed = true
			break
		}
	}
	if !allowed {
		integrationStoreInstance.UpdateSlackEventStatus(envelope.EventID, "ignored", "channel not selected")
		return
	}

	title := "Slack activity"
	switch event.Type {
	case "app_mention":
		title = "Slack app mention"
	case "message":
		title = "Slack channel message"
	}

	summary := strings.TrimSpace(event.Text)
	if summary == "" {
		summary = fmt.Sprintf("Slack %s event received", event.Type)
	}
	occurredAt := parseSlackTimestamp(event.Ts)
	if occurredAt.IsZero() && envelope.EventTime > 0 {
		occurredAt = time.Unix(envelope.EventTime, 0).UTC()
	}
	if occurredAt.IsZero() {
		occurredAt = time.Now().UTC()
	}

	signal := signalRecord{
		ID:         envelope.EventID,
		Source:     "Slack",
		Title:      title,
		Summary:    summary,
		OccurredAt: occurredAt,
		Meta: map[string]string{
			"eventType": event.Type,
			"channel":   event.Channel,
			"user":      event.User,
			"teamId":    envelope.TeamID,
		},
	}
	if err := integrationStoreInstance.AddSignal(signal); err != nil {
		integrationStoreInstance.UpdateSlackEventStatus(envelope.EventID, "failed", "unable to persist signal")
		return
	}

	integrationStoreInstance.UpdateSlackEventStatus(envelope.EventID, "processed", "")
}

func parseSlackTimestamp(ts string) time.Time {
	ts = strings.TrimSpace(ts)
	if ts == "" {
		return time.Time{}
	}
	parts := strings.SplitN(ts, ".", 2)
	seconds, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return time.Time{}
	}
	nanos := int64(0)
	if len(parts) == 2 {
		fraction := parts[1]
		if len(fraction) > 9 {
			fraction = fraction[:9]
		}
		if len(fraction) < 9 {
			fraction += strings.Repeat("0", 9-len(fraction))
		}
		nanos, _ = strconv.ParseInt(fraction, 10, 64)
	}
	return time.Unix(seconds, nanos).UTC()
}

func handleSignals(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	source := strings.TrimSpace(r.URL.Query().Get("source"))
	limit := 20
	if rawLimit := strings.TrimSpace(r.URL.Query().Get("limit")); rawLimit != "" {
		if parsed, err := strconv.Atoi(rawLimit); err == nil && parsed > 0 && parsed <= 200 {
			limit = parsed
		}
	}

	signals := integrationStoreInstance.ListSignals(source, limit)
	writeJSON(w, http.StatusOK, signalsResponse{Signals: signals})
}
