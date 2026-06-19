// deno-lint-ignore-file require-await
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { tools } from '../../mod.ts';
import type { PluginContext, ToolContext } from '../../types.ts';

// Mock PluginContext
const mockContext: PluginContext & ToolContext = {
  pluginId: 'cortex-plugin-knowledge-graph',
  pluginDir: '/tmp/plugins/cortex-plugin-knowledge-graph',
  state: {
    get: async () => null,
    set: async () => {},
    delete: async () => {},
    list: async () => ({}),
  },
  config: {
    get: async () => null,
    set: async () => {},
    getAll: async () => ({}),
  },
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
  host: {
    registerTool: () => {},
    unregisterTool: () => {},
  },
  sessionId: 'test-session',
  workingDir: '/tmp',
  agentId: 'test-agent',
  workspaceDir: '/tmp',
};

function findTool(name: string) {
  const tool = tools.find((t) => t.definition.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
}

Deno.test('tools array — exports all tools', () => {
  assertEquals(tools.length, 6);
  assertEquals(tools[0].definition.name, 'graph_add_entity');
  assertEquals(tools[1].definition.name, 'graph_add_relationship');
  assertEquals(tools[2].definition.name, 'graph_query');
  assertEquals(tools[3].definition.name, 'graph_extract_from_text');
  assertEquals(tools[4].definition.name, 'graph_visualize');
  assertEquals(tools[5].definition.name, 'graph_stats');
});

Deno.test('graph_add_entity — rejects empty name', async () => {
  const tool = findTool('graph_add_entity');
  const result = await tool.execute({ 'name': '' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'non-empty string');
});

Deno.test('graph_add_relationship — rejects empty from_entity', async () => {
  const tool = findTool('graph_add_relationship');
  const result = await tool.execute({ 'from_entity': '' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'non-empty string');
});

Deno.test('graph_query — rejects empty query', async () => {
  const tool = findTool('graph_query');
  const result = await tool.execute({ 'query': '' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'non-empty string');
});

Deno.test('graph_extract_from_text — rejects empty content', async () => {
  const tool = findTool('graph_extract_from_text');
  const result = await tool.execute({ 'content': '' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error ?? '', 'non-empty string');
});

Deno.test('graph_visualize — tool is defined with name and description', () => {
  const tool = findTool('graph_visualize');
  assertEquals(typeof tool.definition.description, 'string');
  assertEquals(tool.definition.description.length > 0, true);
});

Deno.test('graph_stats — tool is defined with name and description', () => {
  const tool = findTool('graph_stats');
  assertEquals(typeof tool.definition.description, 'string');
  assertEquals(tool.definition.description.length > 0, true);
});

Deno.test('all tools return durationMs', async () => {
  for (const tool of tools) {
    const args: Record<string, unknown> = {};
    const result = await tool.execute(args, mockContext);
    assertEquals(typeof result.durationMs, 'number');
    assertEquals(result.durationMs >= 0, true);
  }
});
