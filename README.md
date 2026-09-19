An autonomous Agentic Support bot for Gmodstore tickets. It uses a Redis, NodeJS & Gemini AI tech stack to receive, process and output ticket responses. Files outside the users addon are not exposed to the client. System instructions ensure the AI bot stays on track. Users can request to escalate the ticket to human response at any time.
**Note** The system is multi model it can read and analyse users attachments!!

Using Gemini 3.5 Flash this is an easy relatively cheap performance and satisfaction boost for your clients. 

## How it works:
```
User Creates Ticket Message
|
Send the request to the AI API (Gemini)
\/        /\
The AI can call functions to appropriately respond to the ticket
e.g. read file sv_functions.lua or sh_config.lua to help the user
|
The AI continues to call tools until its complete
|
The response is sent back to Gmodstore
```

## Rate limiting
To avoid users burning tokens with a rouge AI hallucinations one ticket can contain 10 messages before the user is automatically handed to a human support agent.

## Env
```
PORT=3000

# Webhook on the teams page (ticket_message.created, ticket_attachment.created)
GMODSTORE_SECRET=

# https://www.gmodstore.com/settings/personal-access-tokens (ticket:read, ticket-messages:write)
GMODSTORE_API_AUTH=

# Cheap as chips OP API
# https://aistudio.google.com/apikey
GEMINI_API_KEY=

YOUR_GMODSTORE_ID=

# leave these empty to disable they are for local testing
NGROK_AUTHTOKEN=
NGROK_DOMAIN=
```

## Installation & Running
`npm install`
`npm start`
