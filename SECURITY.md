# Security Policy

Dukaan.AI is committed to ensuring the security, privacy, and integrity of our software and the merchants and customers who rely on it.

---

## Supported Versions

Only the latest active release branch receives security updates and patches.

| Version | Supported | Notes |
| :--- | :--- | :--- |
| **2.x (Current)** | :white_check_mark: | Active development & current release |
| **< 2.0** | :x: | Legacy / unsupported |

---

## Reporting a Vulnerability

If you discover a security vulnerability in Dukaan.AI, please report it responsibly.

> [!IMPORTANT]
> **Do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

### How to Report

1. **GitHub Security Advisory**: Submit a private report via the [GitHub Security Advisory](https://github.com/dishudhalwal12/dukaan.ai/security/advisories/new) dashboard on this repository.
2. **Direct Contact**: If private advisories are unavailable, contact the repository maintainers directly with details.

### What to Include in Your Report

To help us triage and resolve the issue quickly, please provide:
- A clear description of the vulnerability and its potential impact.
- Step-by-step instructions or a minimal Proof of Concept (PoC) to reproduce the issue.
- The affected component (e.g., POS Frontend, Baileys WhatsApp Engine, API endpoints).
- Any suggested mitigations or patches, if available.

### Response Timeline

- **Acknowledgment**: We aim to acknowledge receipt of your vulnerability report within **48 hours**.
- **Assessment**: We will confirm the issue, determine its severity, and provide an initial assessment within **5 business days**.
- **Resolution**: We will keep you informed of our progress toward a fix and coordinate disclosure once the patch is published.

---

## Security Guidelines for Deployers & Shopkeepers

### 1. Protect WhatsApp Session Credentials (`auth_info/`)
The `whatsapp/auth_info/` directory contains multi-device cryptographic keys and session credentials for your connected WhatsApp phone.
- **Never commit `auth_info/` to version control.** It is git-ignored by default.
- Restrict filesystem access to the server environment where the WhatsApp engine runs.
- If you suspect session compromise, immediately disconnect the session from WhatsApp on your phone (**Linked Devices** > **Log out**).

### 2. Safeguard API Keys & Environment Variables
- Keep `.env` and `whatsapp/.env` files private and excluded from git tracking.
- Restrict OpenRouter or cloud API keys with spending limits and domain/IP restrictions where supported.

### 3. Customer Data & Privacy
- Dukaan.AI processes customer phone numbers, delivery addresses, and basket details.
- Store databases and order logs in secure, restricted local storage or authenticated backend instances.
- Comply with applicable local privacy laws regarding customer phone numbers and messaging permissions.

### 4. Network Exposure & Tunneling
- By default, the POS (`PORT=3000`) and WhatsApp Engine (`PORT=5001`) bind locally.
- If exposing endpoints via reverse proxies, tunnels (e.g., Cloudflare Tunnels, ngrok), or production servers, enforce HTTPS/TLS and appropriate access controls.
