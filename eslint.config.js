// eslint.config.js
// @ts-check
import globals from "globals";

export default [
    // Игноры (вместо --ignore-path)
    { ignores: ["node_modules/**", "dist/**", "build/**", "**/*.min.js", "eslint.config.js"] },

    // Базовые правила для всех .js
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "script",
            globals: {
                ...globals.browser,
                chrome: "readonly",
                MMS: "writable"
            }
        },
        rules: {
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
            "no-constant-condition": ["warn", { checkLoops: false }],
            "no-console": "off",
            "no-var": "error",
            "prefer-const": "warn",
            eqeqeq: ["warn", "smart"]
        }
    },

    // При необходимости — особые глобалы для сервис-воркера
    {
        files: ["background.js"],
        languageOptions: {
            globals: {
                ...globals.worker
            }
        }
    }
];
