import type { PluginContext, Tool, ToolCallResult, ToolContext } from './types.ts';

type EntityType = 'person' | 'project' | 'service' | 'concept' | 'file' | 'tool' | 'decision';
type RelationshipType =
  | 'depends_on'
  | 'implements'
  | 'references'
  | 'owns'
  | 'triggers'
  | 'part_of'
  | 'related_to';
type VizFormat = 'mermaid' | 'json' | 'dot';

interface EntityNode {
  name: string;
  entity_type: EntityType;
  properties: Record<string, string>;
  source: string;
  createdAt: string;
  updatedAt: string;
}

interface Edge {
  from: string;
  to: string;
  relationship: RelationshipType;
  weight: number;
  createdAt: string;
}

interface GraphState {
  nodes: Record<string, EntityNode>;
  edges: {
    from: string;
    to: string;
    relationship: RelationshipType;
    weight: number;
    createdAt: string;
  }[];
}

interface PluginConfig {
  defaultMaxDepth: number;
  autoExtract: boolean;
}

const ENTITY_TYPES: EntityType[] = [
  'person',
  'project',
  'service',
  'concept',
  'file',
  'tool',
  'decision',
];

const RELATIONSHIP_TYPES: RelationshipType[] = [
  'depends_on',
  'implements',
  'references',
  'owns',
  'triggers',
  'part_of',
  'related_to',
];

const ENTITY_EXTRACTION_PATTERNS: { pattern: RegExp; type: EntityType; label: string }[] = [
  { pattern: /\b([\w.-]+@[\w.-]+\.\w+)\b/g, type: 'person', label: 'email' },
  {
    pattern:
      /\b(?:auth|payment|notification|user|search|analytics|logging|messaging|storage)\s+service\b/gi,
    type: 'service',
    label: 'service-mention',
  },
  {
    pattern: /\b(?:project|repo):\s*["']?([A-Za-z0-9_.-]+)["']?/gi,
    type: 'project',
    label: 'project-ref',
  },
  {
    pattern: /\b(?:file|path):\s*["']?([A-Za-z0-9_/.\\-]+)["']?/gi,
    type: 'file',
    label: 'file-ref',
  },
  { pattern: /\b(?:tool|cli):\s*["']?([A-Za-z0-9_-]+)["']?/gi, type: 'tool', label: 'tool-ref' },
  {
    pattern: /\b(?:decision|ADR):\s*["']?([A-Za-z0-9_\s-]+)["']?/gi,
    type: 'decision',
    label: 'decision-ref',
  },
  {
    pattern: /\b(?:module|system|component|framework):\s*["']?([A-Za-z0-9_-]+)["']?/gi,
    type: 'concept',
    label: 'concept-ref',
  },
];

const RELATIONSHIP_EXTRACTION_PATTERNS: { pattern: RegExp; relationship: RelationshipType }[] = [
  { pattern: /\b(depends\s+(?:on|upon)|requires|needs)\b/gi, relationship: 'depends_on' },
  { pattern: /\b(implements|realizes|fulfills)\b/gi, relationship: 'implements' },
  { pattern: /\b(references|calls|invokes|uses|imports)\b/gi, relationship: 'references' },
  { pattern: /\b(owns|manages|controls|responsible\s+for)\b/gi, relationship: 'owns' },
  { pattern: /\b(triggers|fires|dispatches|emits|publishes)\b/gi, relationship: 'triggers' },
  { pattern: /\b(part\s+of|belongs\s+to|contained\s+in|nested\s+in)\b/gi, relationship: 'part_of' },
  { pattern: /\b(related\s+to|connected\s+to|associated\s+with)\b/gi, relationship: 'related_to' },
];

let pluginCtx: PluginContext | null = null;
const nodes = new Map<string, EntityNode>();
const edges: Edge[] = [];
let config: PluginConfig = { defaultMaxDepth: 3, autoExtract: true };

function saveState(): void {
  if (!pluginCtx) return;
  const state: GraphState = {
    nodes: Object.fromEntries(nodes),
    edges: edges.map((e) => ({ ...e })),
  };
  pluginCtx.state.set('knowledge-graph', state);
}

function loadState(): void {
  if (!pluginCtx) return;
  const saved = pluginCtx.state.get('knowledge-graph') as GraphState | undefined;
  if (saved) {
    nodes.clear();
    edges.length = 0;
    for (const [key, node] of Object.entries(saved.nodes)) {
      nodes.set(key, node as EntityNode);
    }
    edges.push(...saved.edges.map((e) => ({ ...e })));
  }
}

function now(): string {
  return new Date().toISOString();
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

const graphAddEntityTool: Tool = {
  definition: {
    name: 'graph_add_entity',
    description: 'Add an entity node to the knowledge graph',
    params: [
      { name: 'name', type: 'string', description: 'Entity name', required: true },
      {
        name: 'entity_type',
        type: 'string',
        description: 'Entity type',
        required: true,
        enum: ENTITY_TYPES,
      },
      {
        name: 'properties',
        type: 'string',
        description: 'JSON object of key-value properties',
        required: false,
      },
      {
        name: 'source',
        type: 'string',
        description: 'Where this entity was discovered',
        required: false,
      },
    ],
    capabilities: ['memory:store'],
  },

  execute: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolCallResult> => {
    const start = Date.now();
    try {
      const name = args.name;
      if (!name || typeof name !== 'string') {
        return {
          toolName: 'graph_add_entity',
          success: false,
          output: '',
          error: 'name must be a non-empty string',
          durationMs: Date.now() - start,
        };
      }

      const entityType = args.entity_type as string;
      if (!entityType || !ENTITY_TYPES.includes(entityType as EntityType)) {
        return {
          toolName: 'graph_add_entity',
          success: false,
          output: '',
          error: `entity_type must be one of: ${ENTITY_TYPES.join(', ')}`,
          durationMs: Date.now() - start,
        };
      }

      const normalizedName = normalizeName(name);
      const existing = nodes.get(normalizedName);

      let properties: Record<string, string> = {};
      if (args.properties && typeof args.properties === 'string') {
        try {
          properties = JSON.parse(args.properties);
          if (typeof properties !== 'object' || Array.isArray(properties)) {
            return {
              toolName: 'graph_add_entity',
              success: false,
              output: '',
              error: 'properties must be a JSON object',
              durationMs: Date.now() - start,
            };
          }
        } catch {
          return {
            toolName: 'graph_add_entity',
            success: false,
            output: '',
            error: 'Invalid JSON in properties',
            durationMs: Date.now() - start,
          };
        }
      }

      const source = (args.source as string) || '';
      const ts = now();

      if (existing) {
        existing.entity_type = entityType as EntityType;
        existing.properties = { ...existing.properties, ...properties };
        if (source) existing.source = source;
        existing.updatedAt = ts;
      } else {
        nodes.set(normalizedName, {
          name,
          entity_type: entityType as EntityType,
          properties,
          source,
          createdAt: ts,
          updatedAt: ts,
        });
      }

      saveState();

      return {
        toolName: 'graph_add_entity',
        success: true,
        output: JSON.stringify({
          name,
          entity_type: entityType,
          action: existing ? 'updated' : 'created',
          totalNodes: nodes.size,
        }),
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'graph_add_entity',
        success: false,
        output: '',
        error: `Failed to add entity: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

const graphAddRelationshipTool: Tool = {
  definition: {
    name: 'graph_add_relationship',
    description: 'Add a relationship edge between two entities',
    params: [
      { name: 'from_entity', type: 'string', description: 'Source entity name', required: true },
      { name: 'to_entity', type: 'string', description: 'Target entity name', required: true },
      {
        name: 'relationship',
        type: 'string',
        description: 'Relationship type',
        required: true,
        enum: RELATIONSHIP_TYPES,
      },
      {
        name: 'weight',
        type: 'number',
        description: 'Relationship weight (default 1.0)',
        required: false,
      },
    ],
    capabilities: ['memory:store'],
  },

  execute: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolCallResult> => {
    const start = Date.now();
    try {
      const fromEntity = args.from_entity;
      const toEntity = args.to_entity;

      if (!fromEntity || typeof fromEntity !== 'string') {
        return {
          toolName: 'graph_add_relationship',
          success: false,
          output: '',
          error: 'from_entity must be a non-empty string',
          durationMs: Date.now() - start,
        };
      }
      if (!toEntity || typeof toEntity !== 'string') {
        return {
          toolName: 'graph_add_relationship',
          success: false,
          output: '',
          error: 'to_entity must be a non-empty string',
          durationMs: Date.now() - start,
        };
      }

      const relationship = args.relationship as string;
      if (!relationship || !RELATIONSHIP_TYPES.includes(relationship as RelationshipType)) {
        return {
          toolName: 'graph_add_relationship',
          success: false,
          output: '',
          error: `relationship must be one of: ${RELATIONSHIP_TYPES.join(', ')}`,
          durationMs: Date.now() - start,
        };
      }

      const fromNorm = normalizeName(fromEntity);
      const toNorm = normalizeName(toEntity);

      if (!nodes.has(fromNorm)) {
        nodes.set(fromNorm, {
          name: fromEntity,
          entity_type: 'concept',
          properties: {},
          source: 'auto-created',
          createdAt: now(),
          updatedAt: now(),
        });
      }
      if (!nodes.has(toNorm)) {
        nodes.set(toNorm, {
          name: toEntity,
          entity_type: 'concept',
          properties: {},
          source: 'auto-created',
          createdAt: now(),
          updatedAt: now(),
        });
      }

      let weight = 1.0;
      if (args.weight !== undefined && args.weight !== null) {
        weight = Number(args.weight);
        if (isNaN(weight) || weight <= 0) {
          return {
            toolName: 'graph_add_relationship',
            success: false,
            output: '',
            error: 'weight must be a positive number',
            durationMs: Date.now() - start,
          };
        }
      }

      const duplicate = edges.find(
        (e) => e.from === fromNorm && e.to === toNorm && e.relationship === relationship,
      );
      if (duplicate) {
        duplicate.weight = weight;
      } else {
        edges.push({
          from: fromNorm,
          to: toNorm,
          relationship: relationship as RelationshipType,
          weight,
          createdAt: now(),
        });
      }

      saveState();

      return {
        toolName: 'graph_add_relationship',
        success: true,
        output: JSON.stringify({
          from: fromEntity,
          to: toEntity,
          relationship,
          weight,
          totalEdges: edges.length,
          totalNodes: nodes.size,
        }),
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'graph_add_relationship',
        success: false,
        output: '',
        error: `Failed to add relationship: ${
          error instanceof Error ? error.message : String(error)
        }`,
        durationMs: Date.now() - start,
      };
    }
  },
};

const graphQueryTool: Tool = {
  definition: {
    name: 'graph_query',
    description: 'Query the knowledge graph with graph traversal',
    params: [
      {
        name: 'query',
        type: 'string',
        description: "Natural language query, e.g. 'Find entities related to X'",
        required: true,
      },
      {
        name: 'entity_name',
        type: 'string',
        description: 'Focus entity for the query',
        required: false,
      },
      {
        name: 'max_depth',
        type: 'number',
        description: 'Maximum traversal depth (default 2)',
        required: false,
      },
      {
        name: 'relationship_filter',
        type: 'string',
        description: 'Comma-separated relationship types to filter by',
        required: false,
      },
    ],
    capabilities: ['memory:store'],
  },

  execute: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolCallResult> => {
    const start = Date.now();
    try {
      const query = args.query;
      if (!query || typeof query !== 'string') {
        return {
          toolName: 'graph_query',
          success: false,
          output: '',
          error: 'query must be a non-empty string',
          durationMs: Date.now() - start,
        };
      }

      const maxDepth = args.max_depth !== undefined
        ? Math.max(1, Number(args.max_depth) || 2)
        : config.defaultMaxDepth;

      let filterSet: Set<RelationshipType> | null = null;
      if (args.relationship_filter && typeof args.relationship_filter === 'string') {
        const filters = args.relationship_filter.split(',').map((s) =>
          s.trim().toLowerCase()
        ) as RelationshipType[];
        const valid = filters.filter((f) => RELATIONSHIP_TYPES.includes(f));
        if (valid.length === 0) {
          return {
            toolName: 'graph_query',
            success: false,
            output: '',
            error: `Invalid relationship filter. Must be one or more of: ${
              RELATIONSHIP_TYPES.join(', ')
            }`,
            durationMs: Date.now() - start,
          };
        }
        filterSet = new Set(valid);
      }

      const lowerQuery = query.toLowerCase();
      const matchingNames: string[] = [];

      for (const [name, node] of nodes) {
        if (
          lowerQuery.includes(name) ||
          (args.entity_name && name === normalizeName(args.entity_name as string))
        ) {
          matchingNames.push(name);
        }
      }

      if (args.entity_name) {
        const focus = normalizeName(args.entity_name as string);
        if (nodes.has(focus) && !matchingNames.includes(focus)) {
          matchingNames.push(focus);
        }
      }

      const visited = new Set<string>();
      const result: { entities: EntityNode[]; relationships: Edge[] } = {
        entities: [],
        relationships: [],
      };

      function traverse(currentNodes: string[], depth: number): void {
        if (depth > maxDepth) return;
        const nextNodes: string[] = [];

        for (const nodeName of currentNodes) {
          if (visited.has(nodeName)) continue;
          visited.add(nodeName);

          const node = nodes.get(nodeName);
          if (node) result.entities.push(node);

          for (const edge of edges) {
            if (edge.from === nodeName || edge.to === nodeName) {
              if (filterSet && !filterSet.has(edge.relationship)) continue;
              if (!result.relationships.includes(edge)) {
                result.relationships.push(edge);
              }
              const neighbor = edge.from === nodeName ? edge.to : edge.from;
              if (!visited.has(neighbor)) {
                nextNodes.push(neighbor);
              }
            }
          }
        }

        if (nextNodes.length > 0) {
          traverse(nextNodes, depth + 1);
        }
      }

      if (matchingNames.length > 0) {
        traverse(matchingNames, 0);
      } else if (nodes.size > 0) {
        result.entities = Array.from(nodes.values());
        result.relationships = edges.slice();
      }

      const output = JSON.stringify({
        query,
        matchedEntities: matchingNames,
        maxDepth,
        entities: result.entities.map((e) => ({
          name: e.name,
          entity_type: e.entity_type,
          source: e.source,
        })),
        relationships: result.relationships.map((e) => ({
          from: nodes.get(e.from)?.name || e.from,
          to: nodes.get(e.to)?.name || e.to,
          relationship: e.relationship,
          weight: e.weight,
        })),
        summary:
          `${result.entities.length} entities, ${result.relationships.length} relationships at depth ${maxDepth}`,
      });

      return { toolName: 'graph_query', success: true, output, durationMs: Date.now() - start };
    } catch (error) {
      return {
        toolName: 'graph_query',
        success: false,
        output: '',
        error: `Failed to query graph: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

const graphExtractFromTextTool: Tool = {
  definition: {
    name: 'graph_extract_from_text',
    description: 'Extract entities and relationships from text content using pattern matching',
    params: [
      {
        name: 'content',
        type: 'string',
        description: 'Text content to extract from',
        required: true,
      },
      {
        name: 'source',
        type: 'string',
        description: 'Source identifier for the extracted entities',
        required: false,
      },
    ],
    capabilities: ['memory:store'],
  },

  execute: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolCallResult> => {
    const start = Date.now();
    try {
      const content = args.content;
      if (!content || typeof content !== 'string') {
        return {
          toolName: 'graph_extract_from_text',
          success: false,
          output: '',
          error: 'content must be a non-empty string',
          durationMs: Date.now() - start,
        };
      }

      const source = (args.source as string) || 'text-extraction';
      const ts = now();

      const extractedEntities: { name: string; entity_type: EntityType }[] = [];
      const extractedRelationships: {
        from: string;
        to: string;
        relationship: RelationshipType;
        weight: number;
      }[] = [];

      const seenEntities = new Set<string>();

      for (const { pattern, type } of ENTITY_EXTRACTION_PATTERNS) {
        for (const match of content.matchAll(pattern)) {
          const entityName = (match[1] || match[0]).trim().replace(/["']/g, '');
          if (!entityName || entityName.length < 2) continue;
          const normalized = normalizeName(entityName);
          if (seenEntities.has(normalized)) continue;
          seenEntities.add(normalized);

          if (!nodes.has(normalized)) {
            nodes.set(normalized, {
              name: entityName,
              entity_type: type,
              properties: {},
              source,
              createdAt: ts,
              updatedAt: ts,
            });
          } else {
            const existing = nodes.get(normalized)!;
            if (!existing.source) existing.source = source;
            existing.updatedAt = ts;
          }

          extractedEntities.push({ name: entityName, entity_type: type });
        }
      }

      for (const { pattern, relationship } of RELATIONSHIP_EXTRACTION_PATTERNS) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const contextStart = Math.max(0, match.index - 80);
          const contextEnd = Math.min(content.length, match.index + match[0].length + 80);
          const context = content.slice(contextStart, contextEnd);

          let connectedFrom = '';
          let connectedTo = '';

          for (const entityName of seenEntities) {
            const lowerCtx = context.toLowerCase();
            if (lowerCtx.includes(entityName)) {
              const pos = lowerCtx.indexOf(entityName);
              if (pos < match.index - contextStart) {
                connectedFrom = entityName;
              } else if (!connectedTo) {
                connectedTo = entityName;
              }
            }
          }

          if (connectedFrom && connectedTo && connectedFrom !== connectedTo) {
            const dupCheck = edges.some(
              (e) =>
                e.from === connectedFrom && e.to === connectedTo && e.relationship === relationship,
            );
            if (!dupCheck) {
              edges.push({
                from: connectedFrom,
                to: connectedTo,
                relationship,
                weight: 1.0,
                createdAt: ts,
              });
              extractedRelationships.push({
                from: connectedFrom,
                to: connectedTo,
                relationship,
                weight: 1.0,
              });
            }
          }
        }
      }

      saveState();

      return {
        toolName: 'graph_extract_from_text',
        success: true,
        output: JSON.stringify({
          source,
          entitiesExtracted: extractedEntities.length,
          relationshipsExtracted: extractedRelationships.length,
          totalNodes: nodes.size,
          totalEdges: edges.length,
          entities: extractedEntities,
          relationships: extractedRelationships,
        }),
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'graph_extract_from_text',
        success: false,
        output: '',
        error: `Failed to extract from text: ${
          error instanceof Error ? error.message : String(error)
        }`,
        durationMs: Date.now() - start,
      };
    }
  },
};

const graphVisualizeTool: Tool = {
  definition: {
    name: 'graph_visualize',
    description: 'Return a visualization-ready graph structure',
    params: [
      {
        name: 'root_entity',
        type: 'string',
        description: 'Root entity to center visualization on',
        required: false,
      },
      {
        name: 'max_nodes',
        type: 'number',
        description: 'Maximum nodes in the visualization (default 50)',
        required: false,
      },
      {
        name: 'format',
        type: 'string',
        description: 'Output format',
        required: false,
        enum: ['mermaid', 'json', 'dot'],
      },
    ],
    capabilities: ['memory:store'],
  },

  execute: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolCallResult> => {
    const start = Date.now();
    try {
      const maxNodes = Math.max(1, Number(args.max_nodes) || 50);
      const format: VizFormat = (['mermaid', 'json', 'dot'].includes(args.format as string)
        ? args.format
        : 'json') as VizFormat;

      let resultEntities: EntityNode[];
      let resultEdges: Edge[];

      if (args.root_entity && typeof args.root_entity === 'string') {
        const rootName = normalizeName(args.root_entity);
        if (!nodes.has(rootName)) {
          return {
            toolName: 'graph_visualize',
            success: false,
            output: '',
            error: `Entity '${args.root_entity}' not found in graph`,
            durationMs: Date.now() - start,
          };
        }

        const visited = new Set<string>();
        const queue = [rootName];
        resultEntities = [];
        resultEdges = [];

        while (queue.length > 0 && resultEntities.length < maxNodes) {
          const current = queue.shift()!;
          if (visited.has(current)) {
            continue;
          }
          visited.add(current);

          const node = nodes.get(current);
          if (node) {
            resultEntities.push(node);
          }

          for (const edge of edges) {
            if (edge.from === current || edge.to === current) {
              resultEdges.push(edge);
              const neighbor = edge.from === current ? edge.to : edge.from;
              if (!visited.has(neighbor)) {
                queue.push(neighbor);
              }
            }
          }
        }
      } else {
        resultEntities = Array.from(nodes.values()).slice(0, maxNodes);
        resultEdges = edges.filter(
          (e) =>
            resultEntities.some((n) =>
              normalizeName(n.name) === e.from
            ) &&
            resultEntities.some((n) => normalizeName(n.name) === e.to),
        );
      }

      let output: string;

      if (format === 'mermaid') {
        const lines: string[] = ['graph TD'];
        const entityIndex = new Map<string, string>();
        resultEntities.forEach((e, i) => {
          const id = `N${i}`;
          entityIndex.set(normalizeName(e.name), id);
          const label = e.name.replace(/"/g, "'");
          lines.push(`  ${id}["${label}\n(${e.entity_type})"]`);
        });
        for (const edge of resultEdges) {
          const fromId = entityIndex.get(edge.from);
          const toId = entityIndex.get(edge.to);
          if (fromId && toId) {
            lines.push(`  ${fromId} -- "${edge.relationship}" --> ${toId}`);
          }
        }
        output = lines.join('\n');
      } else if (format === 'dot') {
        const lines: string[] = ['digraph KnowledgeGraph {'];
        lines.push('  rankdir=LR;');
        lines.push('  node [shape=box, style=filled, fillcolor="#f0f0f0"];');
        const entityIndex = new Map<string, string>();
        resultEntities.forEach((e, i) => {
          const id = `node${i}`;
          entityIndex.set(normalizeName(e.name), id);
          const label = `${e.name}\\n(${e.entity_type})`;
          lines.push(`  ${id} [label="${label}"];`);
        });
        for (const edge of resultEdges) {
          const fromId = entityIndex.get(edge.from);
          const toId = entityIndex.get(edge.to);
          if (fromId && toId) {
            lines.push(
              `  ${fromId} -> ${toId} [label="${edge.relationship}", weight=${edge.weight}];`,
            );
          }
        }
        lines.push('}');
        output = lines.join('\n');
      } else {
        output = JSON.stringify({
          nodes: resultEntities.map((e) => ({
            id: normalizeName(e.name),
            label: e.name,
            entity_type: e.entity_type,
            properties: e.properties,
            source: e.source,
          })),
          edges: resultEdges.map((e) => ({
            from: nodes.get(e.from)?.name || e.from,
            to: nodes.get(e.to)?.name || e.to,
            relationship: e.relationship,
            weight: e.weight,
          })),
          nodeCount: resultEntities.length,
          edgeCount: resultEdges.length,
        });
      }

      return {
        toolName: 'graph_visualize',
        success: true,
        output,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'graph_visualize',
        success: false,
        output: '',
        error: `Failed to visualize graph: ${
          error instanceof Error ? error.message : String(error)
        }`,
        durationMs: Date.now() - start,
      };
    }
  },
};

const graphStatsTool: Tool = {
  definition: {
    name: 'graph_stats',
    description: 'Get statistics about the knowledge graph',
    params: [],
    capabilities: ['memory:store'],
  },

  execute: async (_args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolCallResult> => {
    const start = Date.now();
    try {
      const entityTypeCounts: Record<string, number> = {};
      for (const node of nodes.values()) {
        entityTypeCounts[node.entity_type] = (entityTypeCounts[node.entity_type] || 0) + 1;
      }

      const relationshipCounts: Record<string, number> = {};
      for (const edge of edges) {
        relationshipCounts[edge.relationship] = (relationshipCounts[edge.relationship] || 0) + 1;
      }

      const degreeMap = new Map<string, number>();
      for (const edge of edges) {
        degreeMap.set(edge.from, (degreeMap.get(edge.from) || 0) + 1);
        degreeMap.set(edge.to, (degreeMap.get(edge.to) || 0) + 1);
      }

      let mostConnected = '';
      let maxDegree = 0;
      for (const [entity, degree] of degreeMap) {
        if (degree > maxDegree) {
          maxDegree = degree;
          mostConnected = nodes.get(entity)?.name || entity;
        }
      }

      const sourceCounts: Record<string, number> = {};
      for (const node of nodes.values()) {
        if (node.source) {
          sourceCounts[node.source] = (sourceCounts[node.source] || 0) + 1;
        }
      }

      const stats = {
        totalNodes: nodes.size,
        totalEdges: edges.length,
        entityTypes: entityTypeCounts,
        relationshipTypes: relationshipCounts,
        mostConnectedEntity: mostConnected || '(none)',
        maxDegree,
        sources: sourceCounts,
        graphDensity: nodes.size > 1
          ? ((2 * edges.length) / (nodes.size * (nodes.size - 1))).toFixed(4)
          : '0',
        lastUpdated: nodes.size > 0 ? now() : undefined,
      };

      return {
        toolName: 'graph_stats',
        success: true,
        output: JSON.stringify(stats),
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'graph_stats',
        success: false,
        output: '',
        error: `Failed to get stats: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

export async function onLoad(ctx: PluginContext): Promise<void> {
  pluginCtx = ctx;
  ctx.logger.info('[cortex-plugin-knowledge-graph] Loaded');
  const rawConfig = await ctx.config.get();
  config = {
    defaultMaxDepth: rawConfig?.defaultMaxDepth ?? 3,
    autoExtract: rawConfig?.autoExtract ?? true,
  };
  loadState();
}

export async function onUnload(_ctx: PluginContext): Promise<void> {
  saveState();
  pluginCtx = null;
}

export const tools: Tool[] = [
  graphAddEntityTool,
  graphAddRelationshipTool,
  graphQueryTool,
  graphExtractFromTextTool,
  graphVisualizeTool,
  graphStatsTool,
];
