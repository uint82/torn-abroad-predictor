# Security

## Supported versions

Security fixes are applied to the current `main` branch. Older commits and forks are not supported.

## Reporting a vulnerability

Do not open a public issue for a security problem. Use the repository's private vulnerability reporting:

https://github.com/uint82/torn-abroad-predictor/security/advisories/new

Include the affected version or commit, a short description, and reproduction steps. Do not include a real Torn API key in a report.

## API keys

The app stores API keys in browser local storage and sends them only to `api.torn.com`. Anyone with access to your browser profile or site data can read a stored key. Use a limited Torn key when possible, and remove the key from the app when you no longer need it.

The project will never ask for a Torn password or a key through email, chat, or an issue.
