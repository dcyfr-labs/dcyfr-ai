import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '**/coverage/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // TypeScript handles undefined-variable checking — disable redundant JS rule
      'no-undef': 'off',
      // Allow console in this package (AI framework with logging needs)
      'no-console': 'off',
      // Downgrade to warn — promote to error once all violations are resolved
      'prefer-const': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // Allow require() in migration/compatibility code
      '@typescript-eslint/no-require-imports': 'warn',
      // Allow lexical declarations in case blocks (refactor incrementally)
      'no-case-declarations': 'warn',
      // Allow useless-escape and catch — refactor incrementally
      'no-useless-escape': 'warn',
      'no-useless-catch': 'warn',
      // Allow Function type — too broad to fix in one pass
      '@typescript-eslint/ban-types': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
    },
  },
);


