use reqwest::Client;
use serde::Serialize;

#[derive(Clone)]
pub struct EmailService {
    client: Client,
    api_key: String,
    from_email: String,
    frontend_url: String,
}

#[derive(Serialize)]
struct ResendPayload {
    from: String,
    to: Vec<String>,
    subject: String,
    html: String,
}

impl EmailService {
    /// Build the service from a Resend API key.
    pub fn new(api_key: String, from_email: String, frontend_url: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
            from_email,
            frontend_url,
        }
    }

    pub async fn send_verification(&self, to: &str, username: &str, token: &str) {
        let verify_url = format!(
            "{}/verify-email?token={}",
            self.frontend_url.trim_end_matches('/'),
            token
        );
        let subject = "Verify your email — Privault";
        let html = verification_template(username, &verify_url);

        if let Err(e) = self.send_email(to, subject, &html).await {
            tracing::warn!("Failed to send verification email to {}: {}", to, e);
        }
    }

    pub async fn send_welcome(&self, to: &str, username: &str) {
        let subject = "Welcome to Privault — Your files, your keys";
        let html = welcome_template(username);

        if let Err(e) = self.send_email(to, subject, &html).await {
            tracing::warn!("Failed to send welcome email to {}: {}", to, e);
        }
    }

    async fn send_email(&self, to: &str, subject: &str, html: &str) -> Result<(), String> {
        let payload = ResendPayload {
            from: self.from_email.clone(),
            to: vec![to.to_string()],
            subject: subject.to_string(),
            html: html.to_string(),
        };

        let response = self
            .client
            .post("https://api.resend.com/emails")
            .bearer_auth(&self.api_key)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Resend request error: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "no body".to_string());
            return Err(format!("Resend API error ({}): {}", status, body));
        }

        Ok(())
    }
}

// ── Email Templates ───────────────────────────────────────────────────────────

fn verification_template(username: &str, verify_url: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#0D0E10;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0D0E10;padding:40px 20px">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background-color:#151618;border:1px solid #2A2B2E;border-radius:12px;padding:40px">
<tr><td style="text-align:center;padding-bottom:8px">
<span style="font-family:Georgia,serif;font-size:28px;font-weight:700;letter-spacing:4px;color:#F5F5F0">PRIVAULT</span>
<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:#E41613;margin-left:8px"></span>
</td></tr>
<tr><td style="padding:24px 0 8px;color:#A0A0A0;font-size:14px;text-align:center">
Hello <strong style="color:#F5F5F0">{username}</strong>,
</td></tr>
<tr><td style="padding:8px 0 24px;color:#A0A0A0;font-size:14px;text-align:center;line-height:1.6">
Welcome to Privault. To start using your encrypted vault, please verify your email address.
</td></tr>
<tr><td style="padding:0;text-align:center">
<a href="{verify_url}" style="display:inline-block;background-color:#E41613;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:1px;padding:14px 36px;border-radius:8px;text-transform:uppercase">Verify Email</a>
</td></tr>
<tr><td style="padding:32px 0 0;color:#606060;font-size:12px;text-align:center;line-height:1.5">
If you didn't create a Privault account, you can safely ignore this email.<br>
This link expires in 24 hours.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"#,
        username = username,
        verify_url = verify_url,
    )
}

fn welcome_template(username: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#0D0E10;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0D0E10;padding:40px 20px">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background-color:#151618;border:1px solid #2A2B2E;border-radius:12px;padding:40px">
<tr><td style="text-align:center;padding-bottom:8px">
<span style="font-family:Georgia,serif;font-size:28px;font-weight:700;letter-spacing:4px;color:#F5F5F0">PRIVAULT</span>
<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:#E41613;margin-left:8px"></span>
</td></tr>
<tr><td style="padding:24px 0 16px;color:#F5F5F0;font-size:20px;font-weight:600;text-align:center">
Your vault is ready
</td></tr>
<tr><td style="padding:0 0 24px;color:#A0A0A0;font-size:14px;text-align:center;line-height:1.6">
Hi <strong style="color:#F5F5F0">{username}</strong>,<br><br>
Your email has been verified and your encrypted vault is fully set up.<br><br>
Everything you upload is encrypted in your browser before it reaches our servers.<br>
We never see your files, your passwords, or your keys — that's the Privault promise.
</td></tr>
<tr><td style="padding:0;text-align:center">
<a href="{dashboard_url}" style="display:inline-block;background-color:#E41613;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:1px;padding:14px 36px;border-radius:8px;text-transform:uppercase">Open Vault</a>
</td></tr>
<tr><td style="padding:32px 0 0;color:#606060;font-size:12px;text-align:center;line-height:1.5">
Need help? Reply to this email or check the docs.<br>
— The Privault Team
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"#,
        username = username,
        dashboard_url = "https://localprivault.com/dashboard",
    )
}
