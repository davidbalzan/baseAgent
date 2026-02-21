import type { Plugin, PluginCapabilities } from "@baseagent/core";

/**
 * Plugin that provides comprehensive documentation for the npm installer tool
 * This plugin contributes documentation to the dashboard's docs system
 */
export function createNpmInstallerDocsPlugin(): Plugin {
  return {
    name: "npm-installer-docs",
    phase: "services",
    
    async init(): Promise<PluginCapabilities | null> {
      return {
        docs: [{
          title: "NPM Installer Tool",
          filename: "NPM_INSTALLER.md",
          content: `# NPM Installer Tool

## Overview

The NPM Installer Tool is an enhanced package management solution built on top of pnpm, designed specifically for the baseAgent framework. It provides comprehensive npm artifact installation capabilities with advanced features for monorepo management, workspace handling, and CI/CD integration.

## Features

### 🚀 Core Operations
- **Install**: Add new packages with full dependency type support
- **Update**: Update existing packages to latest compatible versions  
- **Remove**: Clean removal of packages and their unused dependencies
- **Info**: Get detailed package information and metadata
- **Outdated**: Check for outdated dependencies across workspaces
- **Audit**: Security vulnerability scanning and reporting

### 🏗️ Workspace Management
- **Monorepo Support**: Full pnpm workspace integration
- **Selective Installation**: Install packages in specific workspace packages
- **Workspace Filtering**: Use advanced filtering for batch operations
- **Cross-package Dependencies**: Handle internal workspace references

### 📦 Dependency Types
- **Production**: Standard runtime dependencies
- **Development**: Build-time and testing dependencies (--save-dev)
- **Peer Dependencies**: Dependencies provided by consuming applications (--save-peer)  
- **Optional Dependencies**: Packages that enhance functionality but aren't required (--save-optional)

### ⚙️ Advanced Options
- **Frozen Lockfile**: Ensure deterministic installs in CI/CD (--frozen-lockfile)
- **Exact Versions**: Pin exact package versions (--save-exact)
- **Shamefully Hoist**: Compatibility mode for problematic packages
- **Custom Registry**: Use private or alternative npm registries
- **Dry Run**: Preview changes without actual installation
- **Interactive Mode**: Select packages interactively
- **Production Only**: Install only production dependencies (--prod)

## Usage Examples

### Basic Package Installation

\`\`\`json
{
  "packages": ["react", "react-dom"],
  "operation": "install"
}
\`\`\`

### Development Dependencies

\`\`\`json
{
  "packages": ["@types/node", "typescript", "jest"],
  "operation": "install", 
  "dev": true
}
\`\`\`

### Workspace-Specific Installation

\`\`\`json
{
  "packages": ["lodash"],
  "operation": "install",
  "workspace": "packages/core"
}
\`\`\`

### Version-Specific Installation

\`\`\`json
{
  "packages": ["react@^18.0.0", "typescript@~5.0.0"],
  "operation": "install",
  "exact": true
}
\`\`\`

### Production-Only Install (CI/CD)

\`\`\`json
{
  "packages": [],
  "operation": "install",
  "production": true,
  "frozen": true
}
\`\`\`

### Security Audit

\`\`\`json
{
  "packages": [],
  "operation": "audit",
  "verbose": true
}
\`\`\`

### Update Outdated Packages

\`\`\`json
{
  "packages": ["react", "typescript"],
  "operation": "update"
}
\`\`\`

### Remove Unused Dependencies

\`\`\`json
{
  "packages": ["lodash", "moment"],
  "operation": "remove"
}
\`\`\`

### Custom Registry Usage

\`\`\`json
{
  "packages": ["@company/private-package"],
  "operation": "install",
  "registry": "https://npm.company.com"
}
\`\`\`

### Workspace Filtering

\`\`\`json
{
  "packages": ["eslint"],
  "operation": "install",
  "filter": "@baseagent/*",
  "dev": true
}
\`\`\`

## Parameters Reference

### Core Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| \`packages\` | \`string[]\` | - | Array of npm package names with optional versions |
| \`operation\` | \`enum\` | "install" | Operation: install, update, remove, info, outdated, audit |

### Dependency Types

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| \`dev\` | \`boolean\` | false | Install as dev dependencies (--save-dev) |
| \`peer\` | \`boolean\` | false | Install as peer dependencies (--save-peer) |
| \`optional\` | \`boolean\` | false | Install as optional dependencies (--save-optional) |

### Workspace & Location

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| \`workspace\` | \`string\` | - | Target workspace package directory |
| \`global\` | \`boolean\` | false | Install packages globally (--global) |

### Version & Compatibility

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| \`exact\` | \`boolean\` | false | Install exact versions (--save-exact) |
| \`frozen\` | \`boolean\` | false | Use frozen lockfile (--frozen-lockfile) |
| \`shamefully\` | \`boolean\` | false | Use shamefully-hoist for compatibility |

### Registry & Network

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| \`registry\` | \`string\` | - | Custom npm registry URL |
| \`timeoutMs\` | \`number\` | 180000 | Operation timeout in milliseconds |

### Filtering & Selection

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| \`filter\` | \`string\` | - | Filter packages in workspace |
| \`interactive\` | \`boolean\` | false | Show interactive package selection |

### Execution Modes

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| \`dryRun\` | \`boolean\` | false | Preview changes without installing |
| \`production\` | \`boolean\` | false | Install only production dependencies |
| \`verbose\` | \`boolean\` | false | Show verbose output |

## Best Practices

### 1. Workspace Management

When working with monorepos:
- Use \`workspace\` parameter to target specific packages
- Use \`filter\` for batch operations across multiple packages
- Always check workspace structure first with \`operation: "info"\`

### 2. CI/CD Integration

For continuous integration:
- Use \`frozen: true\` to ensure deterministic builds
- Use \`production: true\` for production deployments
- Set appropriate timeouts for large dependency trees

### 3. Security

- Run \`operation: "audit"\` regularly to check for vulnerabilities
- Use exact versions (\`exact: true\`) for critical dependencies
- Review outdated packages with \`operation: "outdated"\`

### 4. Performance

- Use dry runs to preview large operations
- Set appropriate timeouts for complex installations
- Use workspace filtering to limit scope when possible

### 5. Troubleshooting

Common issues and solutions:

**Installation Timeouts**: Increase \`timeoutMs\` for large packages or slow networks

**Workspace Errors**: Verify workspace path exists and contains package.json

**Registry Issues**: Check registry URL and authentication for private packages

**Memory Issues**: Tool has 5MB output buffer, use \`verbose: false\` for large operations

**Lock File Conflicts**: Use \`frozen: false\` in development, \`frozen: true\` in CI

## Integration with BaseAgent

### Skill Location
The tool is implemented as a skill at:
\`skills/npm-installer/handler.ts\`

### Tool Name
\`npm_installer\`

### Required Permissions
- \`exec\`: Required for running pnpm commands
- File system access for workspace validation
- Network access for package downloads

### Context Integration
- Automatically detects workspace configuration
- Uses project root path from tool context
- Validates workspace paths before operations
- Provides rich error reporting and operation status

## Migration from pnpm_install

If migrating from the built-in \`pnpm_install\` tool:

1. **Parameter Mapping**: Most parameters are compatible
2. **Enhanced Features**: Additional operations and options available
3. **Better Error Handling**: More detailed error messages and validation
4. **Workspace Awareness**: Improved monorepo support

### Migration Examples

Old \`pnpm_install\`:
\`\`\`json
{
  "packages": ["react"],
  "dev": true,
  "workspace": "packages/core"
}
\`\`\`

New \`npm_installer\`:
\`\`\`json
{
  "packages": ["react"],
  "operation": "install",
  "dev": true,
  "workspace": "packages/core"
}
\`\`\`

## Troubleshooting

### Common Issues

1. **"pnpm not found"**: Ensure pnpm is installed globally
2. **"Workspace does not exist"**: Check workspace path and package.json existence
3. **"Timeout"**: Increase timeoutMs for large operations
4. **"Registry error"**: Verify registry URL and authentication

### Debug Mode

Use \`verbose: true\` and \`dryRun: true\` for debugging:

\`\`\`json
{
  "packages": ["problem-package"],
  "operation": "install", 
  "verbose": true,
  "dryRun": true
}
\`\`\`

### Log Output

The tool provides structured output:
- \`[exit: code]\`: Process exit code
- \`[workspace]\`: Target workspace
- \`[operation]\`: Performed operation  
- \`[flags]\`: Applied flags
- \`✅/❌\`: Success/failure indicators

## Support & Development

For issues or feature requests:
1. Check the troubleshooting section above
2. Review the parameter reference for correct usage
3. Test with \`dryRun: true\` first
4. Check baseAgent documentation for tool development

---

*This tool enhances the baseAgent ecosystem with comprehensive package management capabilities, designed for modern monorepo workflows and CI/CD integration.*`
        }]
      };
    },
    
    async afterInit(): Promise<void> {
      // No background services needed for documentation plugin
    },
    
    async shutdown(): Promise<void> {
      // No cleanup needed
    }
  };
}