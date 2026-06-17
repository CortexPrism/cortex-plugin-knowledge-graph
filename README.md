# Cortex Plugin — Knowledge Graph

Personal Knowledge Graph Builder — auto-extracts entities and relationships from chat sessions, CR
documents, and tool outputs to build a graph (nodes + edges) stored alongside existing vector
memory. Enables graph-traversal queries like "show me everything related to the auth service."

## Installation

```bash
# From marketplace
cortex plugin install marketplace:cortex-plugin-knowledge-graph

# From GitHub (for development)
cortex plugin install github:CortexPrism/cortex-plugin-knowledge-graph

# Local installation (for development)
cortex plugin install ./manifest.json
```

## Quick Start

After installation, the knowledge graph is ready to use:

```bash
# List available tools
cortex tools list

# Add an entity
cortex tool call graph_add_entity --name "Auth Service" --entity_type service

# Add a relationship
cortex tool call graph_add_relationship --from_entity "Auth Service" --to_entity "User DB" --relationship depends_on

# Extract from text
cortex tool call graph_extract_from_text --content "The auth service depends on the token manager service."

# Query the graph
cortex tool call graph_query --query "Find entities related to auth service" --entity_name "Auth Service"

# Get graph stats
cortex tool call graph_stats

# Visualize
cortex tool call graph_visualize --format mermaid
```

## Tools

### graph_add_entity

Add an entity node to the knowledge graph. If the entity already exists, it will be updated with the
new properties and type.

**Parameters:**

- `name` (string, required) — Entity name
- `entity_type` (string, required) — Entity type: `person`, `project`, `service`, `concept`, `file`,
  `tool`, `decision`
- `properties` (string, optional) — JSON object of key-value properties (e.g.
  `{"language": "go", "port": "8080"}`)
- `source` (string, optional) — Where this entity was discovered (e.g. "chat-session-42",
  "CR-doc-ops")

**Example:**

```bash
cortex tool call graph_add_entity \
  --name "Auth Service" \
  --entity_type service \
  --properties '{"port": "8080", "team": "platform"}' \
  --source "architecture-review"
```

**Output:**

```json
{ "name": "Auth Service", "entity_type": "service", "action": "created", "totalNodes": 1 }
```

---

### graph_add_relationship

Add a relationship edge between two entities. Auto-creates entity nodes if they don't exist.

**Parameters:**

- `from_entity` (string, required) — Source entity name
- `to_entity` (string, required) — Target entity name
- `relationship` (string, required) — Relationship type: `depends_on`, `implements`, `references`,
  `owns`, `triggers`, `part_of`, `related_to`
- `weight` (number, optional, default 1.0) — Relationship strength/weight

**Example:**

```bash
cortex tool call graph_add_relationship \
  --from_entity "Auth Service" \
  --to_entity "User Database" \
  --relationship depends_on \
  --weight 2.0
```

**Output:**

```json
{
  "from": "Auth Service",
  "to": "User Database",
  "relationship": "depends_on",
  "weight": 2.0,
  "totalEdges": 1,
  "totalNodes": 2
}
```

---

### graph_query

Query the knowledge graph using BFS graph traversal from matched entities.

**Parameters:**

- `query` (string, required) — Natural language query text, matched against entity names
- `entity_name` (string, optional) — Specific entity to center the search on
- `max_depth` (number, default 2) — Maximum traversal depth from starting entities
- `relationship_filter` (string, optional) — Comma-separated relationship types to filter (e.g.
  `depends_on,references`)

**Example:**

```bash
cortex tool call graph_query \
  --query "Show me everything related to auth" \
  --entity_name "Auth Service" \
  --max_depth 3 \
  --relationship_filter "depends_on,references"
```

**Output:**

```json
{
  "query": "Show me everything related to auth",
  "matchedEntities": ["auth service"],
  "maxDepth": 3,
  "entities": [
    { "name": "Auth Service", "entity_type": "service", "source": "architecture-review" },
    { "name": "Token Manager", "entity_type": "service", "source": "text-extraction" }
  ],
  "relationships": [
    { "from": "Auth Service", "to": "Token Manager", "relationship": "depends_on", "weight": 1.0 }
  ],
  "summary": "2 entities, 1 relationships at depth 3"
}
```

---

### graph_extract_from_text

Scan text content for entities and relationships using regex pattern matching. Detects entity
mentions (projects, services, files, tools, decisions, concepts, people) and relationship keywords.

**Parameters:**

- `content` (string, required) — Text content to extract from
- `source` (string, optional) — Source identifier for extracted entities

**Supported entity patterns:**

- Emails → `person`
- `service` keyword mentions → `service`
- `project:` / `repo:` prefixes → `project`
- `file:` / `path:` prefixes → `file`
- `tool:` / `cli:` prefixes → `tool`
- `decision:` / `ADR:` prefixes → `decision`
- `module:` / `system:` / `component:` / `framework:` prefixes → `concept`

**Supported relationship patterns:**

- `depends on`, `requires`, `needs` → `depends_on`
- `implements`, `realizes` → `implements`
- `references`, `calls`, `uses`, `imports` → `references`
- `owns`, `manages`, `responsible for` → `owns`
- `triggers`, `fires`, `dispatches`, `publishes` → `triggers`
- `part of`, `belongs to` → `part_of`
- `related to`, `connected to` → `related_to`

**Example:**

```bash
cortex tool call graph_extract_from_text \
  --content "The auth service depends on the token manager. The notification service triggers email delivery." \
  --source "design-doc"
```

---

### graph_visualize

Export the knowledge graph in a visualization-ready format.

**Parameters:**

- `root_entity` (string, optional) — Center the visualization around this entity
- `max_nodes` (number, default 50) — Maximum nodes to include
- `format` (string, enum: `mermaid`, `json`, `dot`) — Output format

**Example:**

```bash
# Mermaid diagram (renderable in Markdown)
cortex tool call graph_visualize --root_entity "Auth Service" --format mermaid

# JSON structure (for programmatic use)
cortex tool call graph_visualize --format json

# Graphviz DOT format
cortex tool call graph_visualize --format dot
```

---

### graph_stats

Get statistics about the knowledge graph including entity distribution, relationship counts, and
graph density.

**Parameters:**

- None

**Example:**

```bash
cortex tool call graph_stats
```

**Output:**

```json
{
  "totalNodes": 15,
  "totalEdges": 23,
  "entityTypes": { "service": 5, "concept": 4, "file": 3, "decision": 2, "tool": 1 },
  "relationshipTypes": { "depends_on": 8, "references": 6, "triggers": 5, "part_of": 4 },
  "mostConnectedEntity": "Auth Service",
  "maxDegree": 7,
  "sources": { "architecture-review": 5, "text-extraction": 10 },
  "graphDensity": "0.1095"
}
```

## Configuration

Configure this plugin in `~/.cortex/config.json`:

```json
{
  "plugins": {
    "cortex-plugin-knowledge-graph": {
      "enabled": true,
      "config": {
        "defaultMaxDepth": 3,
        "autoExtract": true
      }
    }
  }
}
```

### UI Settings

| Section | Field             | Type    | Default | Description                                   |
| ------- | ----------------- | ------- | ------- | --------------------------------------------- |
| General | `defaultMaxDepth` | number  | 3       | Default max traversal depth for graph queries |
| General | `autoExtract`     | boolean | true    | Automatically extract entities from sessions  |

## Capabilities

This plugin declares:

- `tools` — Provides callable tools
- `memory:store` — Persists graph data to plugin state
- `fs:read` — Reads filesystem for text extraction sources

## AI Disclosure

| Field        | Value                                                 |
| ------------ | ----------------------------------------------------- |
| Tools Used   | Claude Code (Anthropic) — scaffold and implementation |
| Human Review | All code reviewed and verified by a human developer   |

## Development

### Setup

```bash
# Install dependencies
deno cache mod.ts

# Run tests
deno task test

# Format code
deno fmt

# Lint
deno lint
```

### Building

```bash
# Validate the plugin
deno task validate

# Test locally
cortex plugin install ./manifest.json
cortex tool call graph_add_entity --name "Test Entity" --entity_type concept

# Use in chat
cortex chat --plugin cortex-plugin-knowledge-graph
```

### Testing

Tests are located in `test/` directory:

```bash
# Run all tests
deno task test

# Run specific test
deno test --allow-all test/unit/mod.test.ts --filter "graph_add_entity"

# Run with coverage
deno test --coverage=.coverage --allow-all test/
```

### Project Structure

```
cortex-plugin-knowledge-graph/
├── mod.ts              # Plugin entry point — all 6 tools + lifecycle hooks
├── manifest.json        # Plugin manifest with tool definitions and capabilities
├── deno.json            # Deno tasks and import map
├── package.json         # Node.js compatibility
├── README.md            # This documentation
├── CHANGELOG.md         # Release history
├── LICENSE              # MIT license
├── AI.md                # AI disclosure details
└── test/
    └── unit/
        └── mod.test.ts  # Unit tests for all tools
```

## Marketplace Publishing

When ready to publish:

1. Update version in `manifest.json`
2. Update `CHANGELOG.md` with changes
3. Commit and tag: `git tag v1.0.0`
4. Push to GitHub: `git push origin main --tags`
5. GitHub Actions automatically publishes to marketplace

For detailed publishing instructions, see [Publishing Plugins](../docs/publishing.md).

## Troubleshooting

### Plugin fails to load

**Error:** `Plugin failed to load: Invalid manifest`

**Solution:** Validate your `manifest.json`:

```bash
deno task validate
```

### Tool doesn't appear

**Error:** `Tool not found`

**Solution:** Ensure the tool is:

1. Exported in the `tools` array in `mod.ts`
2. Declared in `manifest.json` under `tools`
3. Plugin is enabled: `cortex plugin enable cortex-plugin-knowledge-graph`

### Graph state not persisting

**Error:** Graph is empty after restart

**Solution:** Verify:

1. The plugin's `onLoad` hook is loading state from `ctx.state`
2. `memory:store` capability is declared in manifest
3. Plugin is not running in a sandbox that blocks state persistence

## Best Practices

See [Best Practices](../docs/best-practices.md) for complete guidelines.

✅ **Do:**

- Validate all tool parameters including enums
- Handle errors gracefully with descriptive messages
- Return ToolCallResult with `success`, `output`/`error`, and `durationMs`
- Normalize entity names for consistent lookups
- Auto-create entities when adding relationships
- Persist state after every mutation

❌ **Don't:**

- Skip input validation
- Use `ctx.logger` or `ctx.config` in tool execute (use ToolContext only)
- Pass PluginContext to execute handlers
- Return raw objects without ToolCallResult wrapper

## License

MIT — See [LICENSE](./LICENSE) file

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development standards.

## Support

- 📖 [Developing Plugins](../docs/developing.md)
- 📖 [Plugin Best Practices](../docs/best-practices.md)
- 📖 [Manifest Reference](../docs/manifest-reference.md)
- 💬 [Discord Community](https://discord.gg/y7DkaEbPQC)
- 🐛 [Report Issues](https://github.com/CortexPrism/cortex-plugin-knowledge-graph/issues)
