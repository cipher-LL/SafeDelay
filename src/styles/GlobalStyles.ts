import { createGlobalStyle } from 'styled-components';

export const GlobalStyles = createGlobalStyle`
  :root {
    --bg-primary: #1a1a2e;
    --bg-secondary: #16213e;
    --bg-tertiary: rgba(255, 255, 255, 0.1);
    --bg-hover: rgba(255, 255, 255, 0.2);
    --text-primary: #ffffff;
    --text-secondary: rgba(255, 255, 255, 0.7);
    --text-muted: rgba(255, 255, 255, 0.3);
    --accent: #4f46e5;
    --accent-hover: #4338ca;
    --success: #10b981;
    --warning: #f59e0b;
    --danger: #ef4444;
    --border: rgba(255, 255, 255, 0.1);
    --input-bg: rgba(255, 255, 255, 0.05);
    --input-border: rgba(255, 255, 255, 0.2);
  }

  [data-theme="light"] {
    --bg-primary: #f8fafc;
    --bg-secondary: #e2e8f0;
    --bg-tertiary: rgba(0, 0, 0, 0.05);
    --bg-hover: rgba(0, 0, 0, 0.1);
    --text-primary: #1e293b;
    --text-secondary: #64748b;
    --text-muted: #94a3b8;
    --accent: #4f46e5;
    --accent-hover: #4338ca;
    --success: #059669;
    --warning: #d97706;
    --danger: #dc2626;
    --border: rgba(0, 0, 0, 0.1);
    --input-bg: rgba(0, 0, 0, 0.03);
    --input-border: rgba(0, 0, 0, 0.15);
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
      Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%);
    min-height: 100vh;
    color: var(--text-primary);
    transition: background 0.3s, color 0.3s;
  }

  button {
    cursor: pointer;
    font-family: inherit;
  }

  input {
    font-family: inherit;
  }
`;