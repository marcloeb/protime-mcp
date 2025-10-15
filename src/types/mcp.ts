// MCP SDK Type Definitions (Placeholder until official SDK is available)

export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPServerConfig {
  name: string;
  version: string;
  description: string;
  tools: Tool[];
}

export class MCPServer {
  private config: MCPServerConfig;

  constructor(config: MCPServerConfig) {
    this.config = config;
  }

  getTools(): Tool[] {
    return this.config.tools;
  }

  getName(): string {
    return this.config.name;
  }

  getVersion(): string {
    return this.config.version;
  }
}
