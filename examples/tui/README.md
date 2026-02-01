# OpenTUI Examples for DCYFR AI Framework

This directory contains examples demonstrating the interactive Terminal UI features powered by OpenTUI.

## Examples

### 1. Interactive Validation Dashboard

Run a live validation dashboard with real-time metrics:

```bash
cd /Users/drew/DCYFR/code/dcyfr-ai
node bin/tui.js dashboard
```

**Features:**
- ✅ Real-time validation gate status
- 📊 Progress bars for compliance metrics
- 🎯 Overall validation summary
- ⌨️ Keyboard shortcuts (Q=quit, R=refresh, V=verbose)

**Screenshot:**
```
┌─────────────────────────────────────────────────────────┐
│ 🔍 DCYFR Validation Dashboard              PASS        │
├─────────────────────────────────────────────────────────┤
│ 📂 Project: dcyfr-labs                                  │
│ 📊 Version: 1.0.0                                       │
│                                                         │
│ 🎯 Validation Gates                                     │
│ ✓ designTokens     ████████████████████░░ 92.5%  2 iss │
│ ✓ barrelExports    ██████████████████████ 100%   0 iss │
│ ✓ pageLayout       ████████████████░░░░░░ 85.0%  8 iss │
│ ✓ testData         ██████████████████████ 99.8%  1 iss │
│                                                         │
│ Gates Passed  Total Violations  Avg Compliance         │
│ 4/4           11                94.3%                   │
│                                                         │
│ Press Q to quit, R to refresh, V for verbose mode      │
└─────────────────────────────────────────────────────────┘
```

---

### 2. Interactive Configuration Wizard

Create configuration files with an interactive wizard:

```bash
cd /Users/drew/DCYFR/code/dcyfr-ai
node bin/tui.js wizard
```

**Features:**
- 📋 Form inputs for project settings
- 🔌 Checkbox toggles for features
- 🎚️ Sliders for compliance thresholds
- ✨ Real-time config preview

**Workflow:**
1. Enter project name
2. Select config format (YAML/JSON)
3. Toggle features (telemetry, validation, etc.)
4. Set compliance thresholds with sliders
5. Enable/disable agents
6. Review and create config file

---

### 3. Programmatic TUI Usage

Use OpenTUI components in your own scripts:

```javascript
import { createCliRenderer } from '@opentui/core';
import { ValidationDashboard } from '../bin/tui/validation-dashboard.js';
import { loadConfig } from '@dcyfr/ai';

async function main() {
  // Load configuration
  const config = await loadConfig();
  
  // Run validation
  const framework = new ValidationFramework(config.validation);
  const report = await framework.validate({
    projectRoot: process.cwd(),
    files: config.project.include,
    config: config.agents,
  });

  // Render dashboard
  const renderer = await createCliRenderer();
  renderer.root.add(ValidationDashboard({ config, report }));

  // Keep running until user quits
  process.stdin.setRawMode(true);
  process.stdin.on('data', (key) => {
    if (key.toString() === 'q') {
      process.exit(0);
    }
  });
}

main();
```

---

## Component Library

### Available Components

All TUI components are located in `bin/tui/`:

#### validation-dashboard.js
- `StatusIcon({ status })` - Colored status indicators
- `ProgressBar({ value, max, width, label })` - Progress visualization
- `GateStatusRow({ gate })` - Validation gate row
- `AgentSummary({ agents })` - Agent list with status
- `ValidationDashboard({ config, report })` - Full dashboard

#### config-wizard.js
- `FormField({ label, value, onChange, type, options })` - Input/select field
- `Checkbox({ label, checked, onChange })` - Checkbox toggle
- `Slider({ label, value, min, max, onChange })` - Numeric slider
- `AgentConfigSection({ agents, onToggle })` - Agent configuration
- `ConfigWizard({ state, onUpdate, onSubmit, onCancel })` - Full wizard

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Q` | Quit application |
| `R` | Refresh dashboard |
| `V` | Toggle verbose mode |
| `↑↓` | Navigate items |
| `Tab` | Focus next field |
| `Enter` | Select/Submit |
| `Ctrl+C` | Force exit |

---

## Customization

### Creating Custom Components

```javascript
import { Box, Text } from '@opentui/core';

export function CustomMetric({ label, value, color = '#0EA5E9' }) {
  return Box({
    flexDirection: 'row',
    gap: 1,
    children: [
      Text({ content: label, fg: '#888888' }),
      Text({ content: value.toString(), fg: color, bold: true }),
    ],
  });
}
```

### Styling Components

OpenTUI uses CSS-like properties:

```javascript
Box({
  flexDirection: 'column',    // Layout direction
  gap: 2,                      // Space between children
  padding: 1,                  // Internal padding
  marginTop: 2,                // External margin
  borderBottom: true,          // Border
  bg: '#1E1E1E',              // Background color
  fg: '#FFFFFF',              // Foreground (text) color
  bold: true,                  // Text weight
  italic: true,                // Text style
  width: 30,                   // Fixed width
  flexGrow: 1,                 // Flexible width
})
```

---

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Validation Dashboard
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - name: Install dependencies
        run: npm install
      
      - name: Run validation (text mode)
        run: npx @dcyfr/ai config:validate
      
      - name: Run TUI dashboard (CI mode)
        run: |
          # TUI requires TTY, so we use script command
          script -q -c "npx @dcyfr/ai-tui dashboard --ci"
```

---

## Troubleshooting

### TUI Not Rendering

**Issue:** Terminal UI doesn't display correctly

**Solution:**
```bash
# Check terminal supports 256 colors
echo $TERM

# Should output: xterm-256color or similar
# If not, set it:
export TERM=xterm-256color

# Then run TUI
node bin/tui.js dashboard
```

### Keyboard Input Not Working

**Issue:** Keyboard shortcuts don't work

**Solution:**
```javascript
// Ensure raw mode is enabled
process.stdin.setRawMode(true);
process.stdin.resume();
```

### OpenTUI Import Errors

**Issue:** `Cannot find module '@opentui/core'`

**Solution:**
```bash
# Reinstall OpenTUI
npm install @opentui/core --save

# Verify installation
npm list @opentui/core
```

---

## Next Steps

1. **Try the examples** - Run dashboard and wizard
2. **Customize components** - Modify colors, layout, content
3. **Build your own** - Create custom TUI tools
4. **Integrate** - Add to your development workflow

## Resources

- [OpenTUI Documentation](https://opentui.com/docs)
- [DCYFR AI Framework Docs](https://github.com/dcyfr/dcyfr-ai/blob/main/docs/)
- [Examples Source Code](./examples/tui/)

---

**Built with ❤️ using OpenTUI and DCYFR AI Framework**
