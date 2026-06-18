# Changelog

## [Unreleased]

### Added
- Structured logging via ctx.logger in lifecycle hooks

### Changed
- Renamed manifest file from `cortex.json` to `manifest.json` for consistency with Cortex standard
- Standardized UI section structure to `ui.settings` format
- Normalized parameter naming: `defaultValue` → `default`, `options` → `enum`
- Added `homepage` field with repository URL
- Added `dependencies` field to manifest

## [1.0.1] — 2026-06-15

### Added
- Initial release
## [1.0.1] — 2026-06-17

### Added

- N/A

## [1.0.0] — 2026-06-15

### Added

- Initial release of cortex-plugin-knowledge-graph
- `graph_add_entity` tool — Add entity nodes to the knowledge graph with type classification
  (person, project, service, concept, file, tool, decision)
- `graph_add_relationship` tool — Add directed relationship edges between entities with weighted
  connections
- `graph_query` tool — Query the knowledge graph with BFS graph traversal, depth control, and
  relationship filtering
- `graph_extract_from_text` tool — Extract entities and relationships from text content using regex
  pattern matching
- `graph_visualize` tool — Export graph structure in Mermaid, JSON, or Graphviz DOT format
- `graph_stats` tool — Get graph statistics including entity counts, relationship distribution, and
  density
- `onLoad` lifecycle hook with state persistence via PluginContext
- `onUnload` lifecycle hook to flush graph state
- UI settings for default max traversal depth and auto-extract toggle
- In-memory graph storage (nodes Map, edges array) with serialization to plugin state

### Changed

- N/A

### Fixed

- N/A

### Deprecated

- N/A

### Removed

- N/A

### Security

- N/A
