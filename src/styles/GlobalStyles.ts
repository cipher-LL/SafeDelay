import { createGlobalStyle } from 'styled-components';

export const GlobalStyles = createGlobalStyle`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
      Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    min-height: 100vh;
    color: #ffffff;
  }

  button {
    cursor: pointer;
    font-family: inherit;
  }

  input {
    font-family: inherit;
  }
`;
