#!/usr/bin/env node

const allowedOpenAI = new Set(["v4", "v6"]);
const allowedAnthropic = new Set(["v040", "v074"]);

const openai = process.env.OPENAI_API_VERSION?.trim() || "v6";
const anthropic = process.env.ANTHROPIC_API_VERSION?.trim() || "v074";

const errors = [];

if (!allowedOpenAI.has(openai)) {
  errors.push(
    `OPENAI_API_VERSION must be one of ${[...allowedOpenAI].join(", ")} (received: ${openai})`,
  );
}

if (!allowedAnthropic.has(anthropic)) {
  errors.push(
    `ANTHROPIC_API_VERSION must be one of ${[...allowedAnthropic].join(", ")} (received: ${anthropic})`,
  );
}

if (errors.length > 0) {
  console.error("❌ Provider version flag validation failed:\n");
  for (const err of errors) {
    console.error(`- ${err}`);
  }
  process.exit(1);
}

console.log("✅ Provider version flags validated");
console.log(`OPENAI_API_VERSION=${openai}`);
console.log(`ANTHROPIC_API_VERSION=${anthropic}`);
