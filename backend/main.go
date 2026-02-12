package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/smtp"
	"os"
	"strings"
	"time"

	"github.com/clerk/clerk-sdk-go/v2"
	clerkhttp "github.com/clerk/clerk-sdk-go/v2/http"
)

type leadPayload struct {
	FirstName   string `json:"firstName"`
	LastName    string `json:"lastName"`
	WorkEmail   string `json:"workEmail"`
	CompanyName string `json:"companyName"`
}

type errorResponse struct {
	Error string `json:"error"`
}

type okResponse struct {
	Status string `json:"status"`
}

var (
	smtpHost               string
	smtpPort               string
	smtpUser               string
	smtpPass               string
	smtpFrom               string
	smtpTo                 string
	waToken                string
	waPhoneID              string
	waTo                   string
	waTemplate             string
	waLang                 string
)

func main() {
	// Load config
	loadConfig()

	// Initialize Clerk
	clerkSecretKey := strings.TrimSpace(os.Getenv("CLERK_SECRET_KEY"))
	if clerkSecretKey == "" {
		log.Println("WARNING: CLERK_SECRET_KEY is missing. Authentication Middleware will not work correctly.")
	}
	clerk.SetKey(clerkSecretKey)

	mux := http.NewServeMux()

	// Public routes
	mux.HandleFunc("/health", handleHealth)
	
	// Lead API - could be protected or public depending on requirements
	// For now keeping it open as it's a contact form
	mux.HandleFunc("/api/lead", handleLead) 

	// Protected routes
	mux.Handle("/api/me", clerkhttp.RequireHeaderAuthorization()(http.HandlerFunc(handleMe)))

	addr := ":8080"
	log.Printf("listening on %s", addr)
	
	// Apply global middleware: Logging -> CORS (if needed) -> Handler
	// Note: We are manually wrapping specific routes with Clerk auth if needed, 
	// or we could wrap the entire mux if everything was protected.
	if err := http.ListenAndServe(addr, logRequest(mux)); err != nil {
		log.Fatal(err)
	}
}

func loadConfig() {
	smtpHost = strings.TrimSpace(os.Getenv("SMTP_HOST"))
	smtpPort = strings.TrimSpace(os.Getenv("SMTP_PORT"))
	smtpUser = strings.TrimSpace(os.Getenv("SMTP_USER"))
	smtpPass = strings.TrimSpace(os.Getenv("SMTP_PASS"))
	smtpFrom = strings.TrimSpace(os.Getenv("SMTP_FROM"))
	smtpTo = strings.TrimSpace(os.Getenv("SMTP_TO"))

	waToken = strings.TrimSpace(os.Getenv("WHATSAPP_TOKEN"))
	waPhoneID = strings.TrimSpace(os.Getenv("WHATSAPP_PHONE_NUMBER_ID"))
	waTo = strings.TrimSpace(os.Getenv("WHATSAPP_TO"))
	waTemplate = strings.TrimSpace(os.Getenv("WHATSAPP_TEMPLATE_NAME"))
	waLang = strings.TrimSpace(os.Getenv("WHATSAPP_TEMPLATE_LANG"))
	if waLang == "" {
		waLang = "en_US"
	}

	if waToken == "" || waPhoneID == "" || waTo == "" || waTemplate == "" {
		log.Println("WARNING: WhatsApp config missing.")
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, okResponse{Status: "ok"})
}

func handleMe(w http.ResponseWriter, r *http.Request) {
	claims, ok := clerk.SessionFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errorResponse{Error: "unauthorized"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "authenticated",
		"claims": claims,
	})
}

func handleLead(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload leadPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid json"})
		return
	}

	payload.FirstName = strings.TrimSpace(payload.FirstName)
	payload.LastName = strings.TrimSpace(payload.LastName)
	payload.WorkEmail = strings.TrimSpace(payload.WorkEmail)
	payload.CompanyName = strings.TrimSpace(payload.CompanyName)

	if payload.WorkEmail == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "workEmail is required"})
		return
	}

	// Try sending via WhatsApp if configured
	if waToken != "" && waPhoneID != "" && waTo != "" && waTemplate != "" {
		if err := sendWhatsAppTemplate(waToken, waPhoneID, waTo, waTemplate, waLang, payload); err != nil {
			log.Printf("whatsapp send failed: %v", err)
		}
	}

	// Try sending via Email if configured
	if smtpHost != "" && smtpPort != "" && smtpUser != "" && smtpPass != "" && smtpFrom != "" && smtpTo != "" {
		log.Printf("Attempting to send email to %s via %s:%s...", smtpTo, smtpHost, smtpPort)
		if err := sendEmail(smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, smtpTo, payload); err != nil {
			log.Printf("ERROR: email send failed: %v", err)
		} else {
			log.Println("SUCCESS: email sent successfully")
		}
	} else {
		log.Println("SMTP config missing or incomplete.")
	}

	writeJSON(w, http.StatusOK, okResponse{Status: "ok"})
}

func sendWhatsAppTemplate(token, phoneNumberID, to, templateName, lang string, payload leadPayload) error {
	endpoint := fmt.Sprintf("https://graph.facebook.com/v19.0/%s/messages", phoneNumberID)

	bodyParams := []map[string]string{
		{"type": "text", "text": safe(payload.FirstName)},
		{"type": "text", "text": safe(payload.LastName)},
		{"type": "text", "text": safe(payload.WorkEmail)},
		{"type": "text", "text": safe(payload.CompanyName)},
		{"type": "text", "text": time.Now().Format(time.RFC3339)},
	}

	msg := map[string]any{
		"messaging_product": "whatsapp",
		"to":                to,
		"type":              "template",
		"template": map[string]any{
			"name": templateName,
			"language": map[string]string{
				"code": lang,
			},
			"components": []map[string]any{
				{
					"type":       "body",
					"parameters": bodyParams,
				},
			},
		},
	}

	payloadBytes, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(payloadBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 12 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("whatsapp api status %d", resp.StatusCode)
	}

	return nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func logRequest(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start).String())
	})
}

func safe(v string) string {
	if v == "" {
		return "-"
	}
	return v
}

func sendEmail(host, port, user, pass, from, to string, payload leadPayload) error {
	auth := smtp.PlainAuth("", user, pass, host)
	addr := fmt.Sprintf("%s:%s", host, port)

	subject := "New Sentient Demo Request"
	body := fmt.Sprintf("New lead received:\n\nName: %s %s\nEmail: %s\nCompany: %s\nTime: %s",
		payload.FirstName, payload.LastName, payload.WorkEmail, payload.CompanyName, time.Now().Format(time.RFC3339))

	msg := []byte(fmt.Sprintf("To: %s\r\nSubject: %s\r\n\r\n%s", to, subject, body))

	return smtp.SendMail(addr, auth, from, []string{to}, msg)
}
