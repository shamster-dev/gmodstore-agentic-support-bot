require("dotenv").config();

const addonIdToName = new Map()
addonIdToName.set("16fd1b02-e889-42c0-8823-cab0c8f2e342", "Nexus Refunds")
addonIdToName.set("57e07f9c-bafd-49bb-a5b9-619f063bb49e", "Nexus Suits")
addonIdToName.set("67f21a7f-5132-4445-b746-6fdc52afba1e", "Nexus Inventory")
addonIdToName.set("144ed7fd-ff59-416f-9988-bd01dc5bd3a0", "Nexus Event Maker")
addonIdToName.set("61193c3c-3602-4890-acdf-59cb7cc44002", "Nexus Daily Rewards")
addonIdToName.set("4601252b-3417-4947-8da1-68d141d14359", "Nexus Unbox")
addonIdToName.set("8815970d-89f1-4483-9117-bc9f758b7381", "Nexus Job Creator")
addonIdToName.set("acb96645-e246-46d0-900d-89eb7cd4e09f", "Nexus Clans")
addonIdToName.set("b05d1bcf-7c3d-4531-bb1d-bc7f164ba0b9", "Nexus Leaderboards")
addonIdToName.set("e1a32118-76dd-45b3-8be4-6fcee2ab196d", "Nexus Coinflips")
addonIdToName.set("eb444da6-a6b9-4fb3-a143-995e943023a4", "Nexus Battlepass")
addonIdToName.set("f0ade579-4884-4539-92d8-ec2252ab4e9f", "Nexus Maps")
addonIdToName.set("f02416d9-dd5c-4db3-87d7-b77ecf3d4f3c", "Nexus Parties")

const express = require("express");
const ngrok = require("@ngrok/ngrok");
const crypto = require("crypto");
const { GoogleGenAI } = require("@google/genai");
const fs = require("node:fs");
const path = require("node:path");
const redis = require("./redis");

const app = express();
const PORT = process.env.PORT || 3000;

const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

// Middleware
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);

/*
Attachment
{
  eventType: 'ticket_attachment.created',
  data: {
    id: '67e3fcd0-6e48-4746-87aa-5a658adba6da',
    ticketId: 'a94bafd0-daa2-4631-b1f0-7f7e7e16e2db',
    userId: '04af6f0e-86fb-4e11-a91e-b3d2fe72c45a',
    fileHash: '3ffb8c4c2c8ef0b62902c67e9e2a591b8a7fc7d92d8d1aa94e8f605f.png',
    originalName: "Garry's_Mod_logo.svg.png",
    url: 'https://ams3.digitaloceanspaces.com/gmodstore-media/tickets/.../sample.png',
    createdAt: '2026-09-17T20:41:27+00:00',
    updatedAt: '2026-09-17T20:41:27+00:00',
    deletedAt: null,
    abilities: null
  }
}

Message
{
  eventType: 'ticket_message.created',
  data: {
    id: 'f2e9d514-f864-420e-8348-cb43449d1869',
    ticketId: 'a94bafd0-daa2-4631-b1f0-7f7e7e16e2db',
    userId: '04af6f0e-86fb-4e11-a91e-b3d2fe72c45a',
    body: '{"ops":[{"insert":"wad"},{"insert":"\\n"}]}',
    read: false,
    revisionsCount: null,
    revisionId: '0dda40c7-bd78-41de-99da-02c16c340a69',
    revisionCreatedAt: '2026-09-17T20:33:44+00:00',
    createdAt: '2026-09-17T20:33:44+00:00',
    updatedAt: '2026-09-17T20:33:44+00:00',
    deletedAt: null,
    abilities: null
  }
}
*/

async function getTicketInteraction(ticketId, messageId) {
  try {
    const interactionId = await redis.get(`InteractionID:${ticketId}`);
    if (!interactionId) {
      return null;
    }

    const interaction = await ai.interactions.get(interactionId);
    console.log(`[${ticketId} : ${messageId}] Found existing Gemini interaction: ${interaction.id}`);
    return interaction;
  } catch (err) {
    if (err.status === 404) {
      console.warn(`[${ticketId} : ${messageId}] Clearing interaction from redis`);
      await redis.del(`InteractionID:${ticketId}`);
    } else {
      console.error(`[${ticketId} : ${messageId}] Failed to get interaction`, err);
    }

    return null;
  }
}

function readAddonFile(addonName, relativePath) {
  const baseDir = path.resolve(__dirname, "gmod_addons", addonName)
  const targetPath = path.resolve(baseDir, relativePath)

  if (!targetPath.startsWith(baseDir)) {
    return `Access denied: Path is outside the ${addonName} directory.`;
  }

  if (!fs.existsSync(targetPath)) {
    return `Error: File '${relativePath}' was not found in ${addonName}.`;
  }

  try {
    return fs.readFileSync(targetPath, "utf8");
  } catch (err) {
    return `Error reading file: ${err.message}`;
  }
}

function getAddonFileList(addonName) {
  const baseDir = path.resolve(__dirname, "gmod_addons", addonName);

  if (!fs.existsSync(baseDir)) {
    return [];
  }

  const entries = fs.readdirSync(baseDir, { recursive: true, withFileTypes: true });

  return entries
    .filter(dirent => dirent.isFile())
    .map(dirent => {
      const dirPath = dirent.parentPath || dirent.path;
      const fullPath = path.join(dirPath, dirent.name);
      return path.relative(baseDir, fullPath).replace(/\\/g, "/");
    });
}

function normalizeSearchQuery(rawQuery) {
  if (!rawQuery || typeof rawQuery !== "string") return [];

  const candidates = [];
  const trimmed = rawQuery.trim();

  // Nexus . Inventory : GetStats (ent, quickFormat)" -> "Nexus.Inventory:GetStats"
  const funcMatch = trimmed.match(/(?:local\s+)?function\s+([a-zA-Z0-9_\s.:]+?)(?:\s*\(|$)/i);
  if (funcMatch) {
    const cleanedFuncName = funcMatch[1].replace(/\s*([.:])\s*/g, "$1").trim();
    if (cleanedFuncName.length >= 2) {
      candidates.push(cleanedFuncName);

      const parts = cleanedFuncName.split(/[.:]/);
      const leafName = parts[parts.length - 1];
      if (leafName && leafName.length >= 2 && leafName !== cleanedFuncName) {
        candidates.push(leafName);
      }
    }
  }

  // "Nexus . Inventory : GetStats" -> "Nexus.Inventory:GetStats"
  const collapsedSpaces = trimmed
    .replace(/\s*([.:])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  // "GetStats(ent, quickFormat)" -> "GetStats"
  const strippedArgs = collapsedSpaces.replace(/\s*\(.*?\)/g, "").trim();
  if (strippedArgs.length >= 2 && !candidates.includes(strippedArgs)) {
    candidates.push(strippedArgs);
  }

  if (collapsedSpaces.length >= 2 && !candidates.includes(collapsedSpaces)) {
    candidates.push(collapsedSpaces);
  }

  if (!candidates.includes(trimmed)) {
    candidates.push(trimmed);
  }

  return candidates;
}

function isOriginDefinition(trimmedLine, cleanQuery) {
  const escaped = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  if (new RegExp(`^(?:local\\s+)?function\\s+[a-zA-Z0-9_.:]*${escaped}\\s*\\(`, "i").test(trimmedLine)) {
    return true;
  }
  if (new RegExp(`[a-zA-Z0-9_.:]*${escaped}\\s*=\\s*function\\s*\\(`, "i").test(trimmedLine)) {
    return true;
  }
  if (new RegExp(`^hook\\.Add\\s*\\([^)]*${escaped}`, "i").test(trimmedLine)) {
    return true;
  }
  if (new RegExp(`^net\\.Receive\\s*\\(\\s*["'][^"']*${escaped}`, "i").test(trimmedLine)) {
    return true;
  }
  if (new RegExp(`^concommand\\.Add\\s*\\(\\s*["'][^"']*${escaped}`, "i").test(trimmedLine)) {
    return true;
  }

  return false;
}

function extractFunctionBody(lines, startIdx, maxLines = 60) {
  let depth = 0;
  const extracted = [];
  for (let k = startIdx; k < Math.min(lines.length, startIdx + maxLines); k++) {
    const curLine = lines[k];
    extracted.push(curLine);

    const opens = (curLine.match(/\b(function|then|do)\b/g) || []).length;
    const closes = (curLine.match(/\bend\b/g) || []).length;
    depth += opens - closes;

    if (depth <= 0 && k > startIdx) {
      return extracted.join("\n");
    }
  }
  return extracted.join("\n");
}

function searchAddonFiles(addonName, rawQuery, maxResults = 10) {
  if (!rawQuery || typeof rawQuery !== "string" || rawQuery.trim().length < 2) {
    return { error: "Search query must be at least 2 characters long." };
  }

  const baseDir = path.resolve(__dirname, "gmod_addons", addonName);
  if (!fs.existsSync(baseDir)) {
    return { error: `Addon directory '${addonName}' does not exist.` };
  }

  const candidates = normalizeSearchQuery(rawQuery);
  const files = getAddonFileList(addonName);

  // Try each normalized query until we find matches
  for (const candidate of candidates) {
    const cleanQuery = candidate.toLowerCase();
    const definitions = [];
    const references = [];

    for (const relPath of files) {
      const ext = path.extname(relPath).toLowerCase();
      if (ext && ![".lua", ".txt", ".json"].includes(ext)) {
        continue;
      }

      const fullPath = path.resolve(baseDir, relPath);
      if (!fullPath.startsWith(baseDir)) continue;

      let content;
      try {
        const stats = fs.statSync(fullPath);
        if (stats.size > 1024 * 1024) continue; // Skip files > 1MB

        content = fs.readFileSync(fullPath, "utf8");
      } catch {
        continue;
      }

      if (!content.toLowerCase().includes(cleanQuery)) {
        continue;
      }

      const lines = content.split(/\r?\n/);
      let refsInFile = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.toLowerCase().includes(cleanQuery)) continue;

        const trimmedLine = line.trim();
        const isDef = isOriginDefinition(trimmedLine, cleanQuery);

        if (isDef) {
          const funcCode = extractFunctionBody(lines, i, 60);

          definitions.push({
            file: relPath,
            line_number: i + 1,
            is_definition: true,
            definition_header: trimmedLine,
            function_code: funcCode,
          });
        } else {
          if (refsInFile >= 2) continue;
          refsInFile++;

          let enclosingHeader = null;
          let funcStartIdx = -1;

          // Search backwards up to 60 lines for enclosing function
          for (let j = i; j >= Math.max(0, i - 60); j--) {
            const prevLine = lines[j].trim();
            const isFunc =
              prevLine.match(/^(?:local\s+)?function\s+([a-zA-Z0-9_.:]+)\s*\(.*?\)/) ||
              prevLine.match(/^(?:local\s+)?([a-zA-Z0-9_.:]+)\s*=\s*function\s*\(.*?\)/) ||
              prevLine.match(/^(?:hook\.Add|net\.Receive|concommand\.Add|timer\.Create)\s*\(\s*(["'][^"']+["']|[a-zA-Z0-9_.:]+)/);

            if (isFunc) {
              enclosingHeader = prevLine;
              funcStartIdx = j;
              break;
            }
          }

          let functionCode = null;
          if (funcStartIdx !== -1) {
            functionCode = extractFunctionBody(lines, funcStartIdx, 45);
          }

          const startCtx = Math.max(0, i - 2);
          const endCtx = Math.min(lines.length - 1, i + 2);
          const snippet = lines.slice(startCtx, endCtx + 1).map((l, idx) => `${startCtx + idx + 1}: ${l}`).join("\n");

          references.push({
            file: relPath,
            line_number: i + 1,
            is_definition: false,
            enclosing_scope: enclosingHeader || "Global / File Scope",
            function_code: functionCode || undefined,
            context_snippet: !functionCode ? snippet : undefined,
          });
        }
      }
    }

    const combined = [...definitions, ...references].slice(0, maxResults);

    if (combined.length > 0) {
      return {
        query: rawQuery,
        matched_term: candidate,
        total_definitions: definitions.length,
        total_matches: combined.length,
        results: combined,
      };
    }
  }

  return {
    query: rawQuery,
    total_definitions: 0,
    total_matches: 0,
    results: "No matches found.",
  };
}

async function HasEscalatedToHuman(ticketId, messageId) {
  try {
    return (await redis.get(`HasEscalatedToHuman:${ticketId}`)) == "1"
  } catch (err) {
    console.error(`[${ticketId} : ${messageId}] Failed to get if escalated`, err);
  }
}

async function GetTicketAddon(ticketId, messageId) {
  try {
    const cachedAddon = await redis.get(`TicketAddon:${ticketId}`);
    if (cachedAddon) {
      return cachedAddon;
    }

    const res = await fetch(`https://api.pivity.com/v3/tickets/${ticketId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GMODSTORE_API_AUTH}`
      },
    });

    if (!res.ok) {
      return null;
    }

    const body = await res.json();
    const addonId = body.data?.ticketableId || null;

    if (addonId) {
      await redis.set(`TicketAddon:${ticketId}`, addonId, { EX: 60 * 60 * 24 * 7 });
    }

    return addonId;
  } catch (err) {
    console.error(`[${ticketId} : ${messageId}] Failed to get addon from ticket`, err);
    return null;
  }
}


// Routes
app.post("/ticket_event", async (req, res) => {
  try {
    const id = req.headers["webhook-id"]
    const timestamp = req.headers["webhook-timestamp"]
    const concentrated_fields = `${id}.${timestamp}.${req.rawBody}`;

    const decoded_secret = Buffer.from(
      process.env.GMODSTORE_SECRET.replace("whsec_", ""),
      "base64"
    );
    const actual_signature = crypto
      .createHmac("sha256", decoded_secret)
      .update(concentrated_fields)
      .digest("base64");

    const received_sig_b64 = req.headers["webhook-signature"].replace(/^v1,/, "");
    const isSafe = crypto.timingSafeEqual(
      Buffer.from(actual_signature, "base64"),
      Buffer.from(received_sig_b64, "base64")
    );

    if (!isSafe) {
      console.log("Invalid credentials")
      res.status(401).json({ status: "stopped", reason: "Invalid Credentials" })
      return
    }

    const messageId = req.body.data.id
    const isNew = await redis.set(`WebhookLock:${messageId}`, "1", { NX: true, EX: 300 });
    if (!isNew) {
      return res.status(200).json({ status: "stopped", reason: "Already processing this webhook" });
    }

    const ticketId = req.body.data.ticketId

    if (await HasEscalatedToHuman(ticketId, messageId)) {
      return res.status(200).json({ status: "stopped", reason: "Ticket already escalated" });
    }

    let inputParts = []

    let usersMsg = ""
    if (req.body.eventType == "ticket_message.created") {
      usersMsg = JSON.parse(req.body.data.body)["ops"].reduce((prevValue, value) => {
        return prevValue + value.insert + " "
      }, "")

      if (req.body.data.userId === process.env.YOUR_GMODSTORE_ID && usersMsg.startsWith("[ Nexus AI Assistant ]")) {
        return res.status(200).json({ status: "stopped", reason: "The webhook is an AI reply" });
      }

      inputParts.push({
        "type": "text",
        "text": usersMsg
      })
    }

    let attachmentURL = ""
    if (req.body.eventType == "ticket_attachment.created") {
      attachmentURL = req.body.data.url

      inputParts.push({
        "type": "image",
        "uri": attachmentURL,
        "mime_type": "image/png"
      })
    }

    if (usersMsg === "" && attachmentURL === "") {
      return res.status(200).json({ status: "failed", reason: "Empty user message" });
    }

    // Rate limit feature, allow the user to have up to 10 messages with the AI so they dont burn our wallets <3
    const userMsgCount = await redis.incr(`UserMsgCount:${ticketId}`);
    if (userMsgCount === 1) {
      await redis.expire(`UserMsgCount:${ticketId}`, 60 * 60 * 24 * 7);
    }

    if (userMsgCount > 10) {
      console.log(`[${ticketId} : ${messageId}] Message count ${userMsgCount} exceeded limit (> 10). Auto-escalating to human.`);
      await redis.set(`HasEscalatedToHuman:${ticketId}`, "1", { EX: 60 * 60 * 24 * 14 });

      if (userMsgCount === 11) {
        const escalationMsg = "[ Nexus AI Assistant ] You have reached the maximum automated message limit for this ticket. I have escalated this ticket to our human support team, and a team member will assist you shortly!";
        await fetch(`https://api.pivity.com/v3/tickets/${ticketId}/messages?richTextFormat=markdown`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.GMODSTORE_API_AUTH}`
          },
          body: JSON.stringify({
            body: escalationMsg,
          }),
        });
      }

      return res.status(200).json({ status: "stopped", reason: "Exceeded 10 message limit, escalated to human" });
    }
    
    const addonId = await GetTicketAddon(ticketId, messageId);

    console.log(`[${ticketId} : ${messageId}] Received request (msg #${userMsgCount}): \n${usersMsg}`)

    let complete = false;
    let cur_interaction = await getTicketInteraction(ticketId, messageId);
    let failed_attempts = 0
    while (!complete) {
      console.log(`[${ticketId} : ${messageId}] Contacting AI Failed Attempts ${failed_attempts} Convo ID: ${cur_interaction?.id || (typeof cur_interaction === "string" ? cur_interaction : null)}`)
      if (failed_attempts == 4) {
        return res.status(200).json({ status: "failed", reason: "AI response failed" });
      }

      try {
        cur_interaction = await ai.interactions.create({
          previous_interaction_id: cur_interaction?.id || (typeof cur_interaction === "string" ? cur_interaction : null),
          model: "gemini-3.5-flash",
          input: inputParts,
          generation_config: {
            thinking_level: "minimal",
          },
          system_instruction: `
            You are a professional Gmodstore Ticket Support worker for the "Nexus" team.
            Your job is to read tickets and respond responsible and accordingly.

            Your information:
            0. You are currently working and only have access to the ${addonIdToName.get(addonId) || "Invalid Addon"} Addon.
            1. If you receive an image but there is no text to converse to in the chat history from the user respond and ask how you can help.
            2. If you receive text context by itself or with an image you must analyse the users issue. If its an addon issue, diagnose the file the issue occurs in and call the correct function.
            3. If it is a "Nexus Library" issue that is out of your scope.
            4. Any issues out of your AI scope you must respond to the user and state you are transfering them to human help.
            5. Do not be scared to request human help, if a user requests it give them it.
            6. If you are escalating to a human call the escalate function and provide a reason.
            7. If you can resolve the users issue yourself, DO IT. You can use the tool search_addon_code to search across files for phrases, hooks, or functions, and get_file_contents to read specific files.
            8. If you believe the user is doing a custom edit converse with them to figure out the issue and help them.
            9. You may go off scope if it includes the addon e.g. custom edits.
            10. You may ask the user for screenshots.

            The files you have access to:
            ${getAddonFileList(addonId).join("\n")}

            Your outputs:
            1. Have [ Nexus AI Assistant ] at the start of your reply to the customer.
            2. Ensure to tell the user they can escalate to human help at anytime.
            3. Be professional and helpful.
            4. Do not go off topic or off scope. You are a purely an addon support worker and nothing else. for example if someone asks about cheese types, ignore it and continue on with the ticket and politely tell the user they are off topic and you can only help with addon related issues. 
            5. If you need to request more information from the user do so politely and accordingly.
            6. Your messages may be in quill.
            7. Your messages must be under 1000 characters.
            8. Refrain from telling users to open or check files. If you want to state to the user "if you check file x you will see this is the issue" instead summarize the issue to them.
            9. Never state to the user that your internal tools, functions, or searches failed or encountered an error. If code or files are not found, respond naturally without mentioning internal tools.
          `,
          tools: [
            {
              type: "function",
              name: "get_file_contents",
              description: "Get a files contents",
              parameters: {
                type: "object",
                properties: {
                  filepath: {
                    type: "string",
                    description: "The full path of the required file e.g. lua/nexus_inventory/sh_config.lua"
                  },
                },
                required: ["filepath"],
              }
            },
            {
              type: "function",
              name: "search_addon_code",
              description: "Search for a keyword, phrase, hook, function name, or error text across all files in the current addon. Returns matching files, line numbers, enclosing function definitions/bodies, and context snippets.",
              parameters: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "The phrase, function name, hook, variable, or error text to search for (case-insensitive)"
                  }
                },
                required: ["query"]
              }
            },
            {
              type: "function",
              name: "escalate_to_human",
              description: "Escalate the ticket to human support.",
              parameters: {
                type: "object",
                properties: {
                  reason: {
                    type: "string",
                    description: "The specific reason why the ticket is being escalated to a human"
                  }
                },
                required: ["reason"],
              }
            },
          ]
        });
      } catch (err) {
        console.error("Gemini Interaction Failed", err)

        if (err.status === 404) {
          console.warn(`[${ticketId} : ${messageId}] Previous interaction not found or model changed. Resetting interaction in Redis.`);
          await redis.del(`InteractionID:${ticketId}`);
          cur_interaction = null;
        } else {
          failed_attempts = failed_attempts + 1;
        }
        continue
      }

      // if the interaction is invalid or has not reached the required status
      if (!cur_interaction || !(cur_interaction.status === "completed" || cur_interaction.status === "requires_action")) {
        failed_attempts = failed_attempts + 1
        continue
      }

      if (cur_interaction.id) {
        await redis.set(`InteractionID:${ticketId}`, cur_interaction.id, { EX: 60 * 60 * 24 * 1 }); // set to 1 days as gemini expiries after 1 day
      }

      if (cur_interaction.status === "requires_action") {
        inputParts = []

        for (const value of cur_interaction.steps) {
          if (value.type === "function_call" && value.name === "get_file_contents") {
            const filePath = value.arguments?.filepath;
            console.log(`[${ticketId} : ${messageId}] Tool call get_file_contents: "${filePath}"`);

            inputParts.push({
              "type": "text",
              "text": `Function response for ${value.name}:
                ${readAddonFile(addonId, filePath)}
              `
            })
          } else if (value.type === "function_call" && value.name === "search_addon_code") {
            const query = value.arguments?.query || value.arguments?.phrase || value.arguments?.search || value.arguments?.keyword;
            console.log(`[${ticketId} : ${messageId}] Tool call search_addon_code: "${query}"`);

            const searchResults = searchAddonFiles(addonId, query);
            console.log(`[${ticketId} : ${messageId}] Search found ${searchResults.total_matches || 0} matches (matched term: "${searchResults.matched_term || query}")`);

            inputParts.push({
              "type": "text",
              "text": `Function response for ${value.name}:
                ${JSON.stringify(searchResults, null, 2)}
              `
            })
          } else if (value.type === "function_call" && value.name === "escalate_to_human") {
            const reason = value.arguments?.reason || "No reason provided";
            console.log(`[${ticketId} : ${messageId}] Bot escalated to human. Reason: ${reason}`);

            try {
              await redis.set(`HasEscalatedToHuman:${ticketId}`, "1", { EX: 60 * 60 * 24 * 14 })

              inputParts.push({
                "type": "text",
                "text": `Successfully internally escalated to a human. Reason recorded: ${reason}`
              })
            } catch (err) {
              console.error(`[${ticketId} : ${messageId}] Failed to escalate to human.`, err);

              inputParts.push({
                "type": "text",
                "text": "Failed to internally escalate to a human"
              })
            }
          }
        }

        continue
      }

      // we have hit the status "completed"
      if (!cur_interaction.output_text || cur_interaction.output_text === "") {
        return res.status(200).json({ status: "failed", reason: "AI response failed or empty" });
      }

      complete = true
    }

    console.log(`[${ticketId} : ${messageId}] Sending POST to Gmodstore`)
    console.log("Body: ", cur_interaction.output_text)
    const gmodstore_response = await fetch(`https://api.pivity.com/v3/tickets/${ticketId}/messages?richTextFormat=quill`, {
      method: "POST",
      headers: {
        ["Content-Type"]: "application/json",
        ["Authorization"]: `Bearer ${process.env.GMODSTORE_API_AUTH}`
      },
      body: JSON.stringify({
        body: cur_interaction.output_text,
      }),
    })

    const responseBody = await gmodstore_response.text()
    if (!gmodstore_response.ok) {
      throw new Error(`Gmodstore API returned status ${gmodstore_response.status}: ${responseBody}`);
    }

    res.json({
      status: "ok",
      message: "Webhook received and processed successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    if (req.body?.data?.id) {
      await redis.del(`WebhookLock:${req.body.data.id}`);
    }

    console.error(err)
    return res.status(500).json({ status: "failed", reason: "Internal server error" });
  }
});

// HTTP Service
app.listen(PORT, async () => {
  console.log(`Express server listening on http://localhost:${PORT}`);

  if (!process.env.NGROK_DOMAIN) {
    console.warn("\n⚠️  NGROK_DOMAIN not set, ngrok tunnel will not be started.\n");
    return
  }

  try {
    const listener = await ngrok.forward({
      addr: PORT,
      authtoken: process.env.NGROK_AUTHTOKEN,
      domain: process.env.NGROK_DOMAIN,
    });

    console.log(`\n✅ ngrok tunnel active:`);
    console.log(`   Public URL: ${listener.url()}\n`);
  } catch (err) {
    console.error("\n⚠️  ngrok failed to start:", err.message);
    console.error(
      "   Set NGROK_AUTHTOKEN in your .env and try again."
    );
    console.error(
      "   Get your token at: https://dashboard.ngrok.com/get-started/your-authtoken\n"
    );
  }
});