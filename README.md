# Gmodstore Agentic Support Bot 🤖

An autonomous, agentic AI ticket support bot for [Gmodstore](https://www.gmodstore.com). Powered by Google Gemini (`@google/genai`), Redis, and Express.

The bot listens for Gmodstore ticket webhooks, autonomously reads and inspects Garry's Mod addon files to diagnose user issues, and replies directly to tickets.

## ✨ Features

- **Autonomous Tool Execution (ReAct Loop)**: Equipped with function calling tools (`get_file_contents` and `escalate_to_human`) to diagnose bugs directly from addon codebases.
- **Multimodal Support**: Diagnoses error logs and screenshots attached by customers.
- **Server-Side Session State**: Uses the Gemini Interactions API paired with Redis for persistent multi-turn ticket conversations.
- **Auto-Escalation & Rate Limiting**: Automatically transfers tickets to human staff if an issue is beyond AI scope, or if a user exceeds the message threshold.
- **Anti-Spam & Webhook Deduplication**: Uses Redis atomic locks (`NX`) to prevent duplicate webhook processing.
- **Secure Webhook Verification**: Cryptographically validates incoming Gmodstore webhooks via HMAC-SHA256 signatures with timing-safe comparisons.

## 📋 Prerequisites

- **Node.js**: v18 or newer
- **Redis**: Running locally or hosted (e.g. Redis Cloud / Upstash)
- **Gmodstore Personal Access Token**: With `ticket:read` and `ticket-messages:write` permissions
- **Gmodstore Webhook Secret**: From your team's webhook settings
- **Google Gemini API Key**: From [Google AI Studio](https://aistudio.google.com)

## 🚀 Setup & Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/shamster-dev/gmodstore-agentic-support-bot.git
   cd gmodstore-agentic-support-bot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Fill in your credentials:
   ```env
   PORT=3000
   GMODSTORE_SECRET=whsec_your_secret_here
   GMODSTORE_API_AUTH=your_personal_access_token
   GEMINI_API_KEY=your_gemini_api_key
   YOUR_GMODSTORE_ID=your_gmodstore_user_id

   # Optional: local tunneling with Ngrok
   NGROK_AUTHTOKEN=
   NGROK_DOMAIN=
   ```

4. **Add your addon codebases:**
   Place your addon directories inside `gmod_addons/<gmodstore_addon_id>/`.
   *(This folder is ignored by git to protect proprietary code).*

5. **Start the server:**
   ```bash
   npm start
   ```

## 📄 License

MIT License.
