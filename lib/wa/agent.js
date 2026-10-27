import Anthropic from '@anthropic-ai/sdk';
import { runTool } from './dispatch';
import { buildDynamicContext, buildSystem, toolDefinitions } from './tools.mjs';

export const HAIKU_MODEL = 'claude-haiku-5-5';
const maxSteps = 3;
let client;

/**
 * One Claude conversation for one WhatsApp message.
 * The tool list and static prompt are cached; effort is low because the work is routing, not reasoning.
 * @returns {Promise<{ reply: string, directReply?: string, proposals: any[], usage: object }>}
 */
export async function runAgent({ text, admin, actor, assignees, history, now }) {
  client ||= new Anthropic();
  const proposals = [];
  const toolContext = { admin, actor, assignees, proposals };
  const system = buildSystem(buildDynamicContext({ actor, assigneeNames: assignees.map((employee) => employee.name), history, now }));
  const messages = [{ role: 'user', content: text }];
  const usage = { model: HAIKU_MODEL, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 };
  let reply = '';

  for (let step = 0; step < maxSteps; step += 1) {
    const response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1024,
      output_config: { effort: 'low' },
      system,
      tools: toolDefinitions,
      messages,
    });
    usage.input_tokens += response.usage?.input_tokens || 0;
    usage.output_tokens += response.usage?.output_tokens || 0;
    usage.cache_read_tokens += response.usage?.cache_read_input_tokens || 0;
    usage.cache_write_tokens += response.usage?.cache_creation_input_tokens || 0;

    const replyText = response.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n').trim();
    if (replyText) reply = replyText;
    const toolUses = response.content.filter((block) => block.type === 'tool_use');
    if (response.stop_reason !== 'tool_use' || !toolUses.length) break;

    // Pass the model's content back unchanged (thinking blocks included).
    messages.push({ role: 'assistant', content: response.content });
    const results = [];
    for (const toolUse of toolUses) {
      const result = await runTool(toolUse.name, toolUse.input, toolContext);
      if (result.direct) return { reply: '', directReply: result.text, proposals, usage };
      results.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result.text });
    }
    messages.push({ role: 'user', content: results });
  }

  return { reply, proposals, usage };
}
