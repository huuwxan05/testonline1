<?php
declare(strict_types=1);

function envv(string $key, ?string $default = null): ?string {
    $v = getenv($key);
    return ($v === false || $v === '') ? $default : $v;
}

return [
    'app' => [
        'env' => envv('APP_ENV', 'production'),
        'url' => rtrim((string)envv('APP_URL', 'http://127.0.0.1:8080'), '/'),
        'name' => envv('APP_NAME', 'ROYAL CASINO'),
        'session_name' => envv('SESSION_NAME', 'royal_session'),
        'cors_origin' => envv('CORS_ORIGIN', ''),
    ],
    'db' => [
        'url' => envv('DATABASE_URL', ''),
        'host' => envv('DB_HOST', '127.0.0.1'),
        'port' => envv('DB_PORT', '5432'),
        'name' => envv('DB_NAME', 'royal_casino'),
        'user' => envv('DB_USER', 'royal_user'),
        'pass' => envv('DB_PASS', ''),
        'sslmode' => envv('DB_SSLMODE', 'prefer'),
    ],
];
