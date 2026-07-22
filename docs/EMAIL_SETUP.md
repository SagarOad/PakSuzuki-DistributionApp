# Email & SMTP setup (Pak Suzuki Distribution)

This project sends branded emails for **OTP**, **account approved**, **rejected**, and **sent back for correction**.

## How SMTP works (short)

1. Your API builds an email (To, Subject, HTML body).
2. It connects to an **SMTP server** (a mail relay) with host/port/username/password.
3. The SMTP server accepts the message and delivers it to the recipient’s inbox (Gmail, Outlook, etc.).

You are **not** running a mail server yourself — you only talk to one (Mailtrap, Gmail, etc.).

```
API  --SMTP-->  Mail provider  --internet-->  User inbox
         or
API  --file-->  email-outbox/*.html   (local preview, no internet)
```

## Free testing modes

### Mode A — Local outbox (default, zero credentials)

In `appsettings.json` / `appsettings.Development.json`:

```json
"Smtp": { "Enabled": false },
"Email": { "SaveToOutbox": true, "OutboxRelativePath": "email-outbox" }
```

Every email is saved as an `.html` file under:

`src/Presentation/PakSuzuki.WebApi/email-outbox/`

Open the latest file in a browser — that is your “inbox” for localhost.

Also check API logs: `Email outbox written: ...`

### Mode B — Mailtrap (free fake inbox in the cloud)

1. Create a free account: https://mailtrap.io  
2. Open **Email Testing → Inboxes → My Inbox → SMTP Settings**  
3. Copy Host / Port / Username / Password  
4. Put them in `appsettings.Development.json` (or User Secrets):

```json
"Smtp": {
  "Enabled": true,
  "Host": "sandbox.smtp.mailtrap.io",
  "Port": 587,
  "UseStartTls": true,
  "UserName": "YOUR_MAILTRAP_USER",
  "Password": "YOUR_MAILTRAP_PASS",
  "FromEmail": "noreply@paksuzuki.local",
  "FromName": "Pak Suzuki | ECSTAR"
}
```

5. Restart the API. Emails appear in the Mailtrap web inbox (not real Gmail).

Mailtrap free tier is enough for development.

### Mode C — Gmail App Password (real inbox)

1. Google Account → Security → enable **2-Step Verification**  
2. Create an **App password** (Mail / Other)  
3. Config:

```json
"Smtp": {
  "Enabled": true,
  "Host": "smtp.gmail.com",
  "Port": 587,
  "UseStartTls": true,
  "UserName": "yourname@gmail.com",
  "Password": "xxxx xxxx xxxx xxxx",
  "FromEmail": "yourname@gmail.com",
  "FromName": "Pak Suzuki | ECSTAR"
}
```

Use an App Password — not your normal Gmail password.

## How to test quickly

### 1) Sample templates (recommended first)

Login as SuperAdmin, then:

```http
POST /api/email/test
Authorization: Bearer <token>
Content-Type: application/json

{ "toEmail": "you@example.com", "template": "otp" }
```

`template` values: `otp` | `approved` | `rejected` | `sent-back`

List recent outbox files (Development only):

```http
GET /api/email/outbox
Authorization: Bearer <token>
```

### 2) OTP API (same path the app will use)

```http
POST /api/auth/send-otp
Content-Type: application/json

{ "destination": "you@example.com", "purpose": "registration" }
```

Response includes `devOtp` when `Otp:DevReturnOtpInResponse` is `true`.  
Email also goes to outbox/SMTP.

Verify:

```http
POST /api/auth/verify-otp
{ "destination": "you@example.com", "purpose": "registration", "code": "123456" }
```

### 3) Approval flow emails

When SuperAdmin/Admin **Approves / Rejects / Sends back** a distributor (or SuperAdmin final-approves a retailer), the matching template is sent automatically to that user’s email.

Distributor reject/send-back for retailers also emails the retailer.

## Calling the email service later (from code)

Inject `IEmailNotificationService`:

```csharp
await _email.SendOtpAsync(email, code, "registration", 5, name, ct);
await _email.SendAccountApprovedAsync(email, name, "Distributor", ct);
await _email.SendAccountRejectedAsync(email, name, "Retailer", remarks, ct);
await _email.SendAccountSentBackAsync(email, name, "Distributor", remarks, ct);
```

Low-level custom HTML: inject `IEmailSender` and send an `EmailMessage`.

## Config reference

| Key | Meaning |
|-----|---------|
| `Smtp:Enabled` | `true` = send over network |
| `Smtp:Host/Port/UserName/Password` | SMTP credentials |
| `Smtp:FromEmail` / `FromName` | Sender identity |
| `Email:SaveToOutbox` | Write HTML files locally |
| `Email:AppBaseUrl` | Used in “Correct registration” link |
| `Otp:DevReturnOtpInResponse` | Return OTP in API JSON (dev only; set `false` in production) |

## Production tips

- Set `Smtp:Enabled` true with a real provider (SendGrid, Amazon SES, company SMTP).
- Set `Otp:DevReturnOtpInResponse` to **false**.
- Prefer **User Secrets** or environment variables for passwords — do not commit real credentials.
- Keep `SaveToOutbox` false in production (or true only if you intentionally archive copies).

## Templates included

| Template | When |
|----------|------|
| OTP | `send-otp` / sample `otp` |
| Approved | Distributor/Retailer approved |
| Rejected | Registration rejected (+ remarks) |
| Sent back | Correction required (+ remarks + link) |
