<?php
declare(strict_types=1);

$config = require __DIR__ . '/../config/config.php';

ini_set('display_errors', '0');
ini_set('log_errors', '1');
	ini_set('error_log', __DIR__ . '/../logs/php-error.log');

session_name($config['app']['session_name']);
session_set_cookie_params([
    'lifetime' => 86400 * 7,
    'path' => '/',
    'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

if ($config['app']['cors_origin']) {
    header('Access-Control-Allow-Origin: ' . $config['app']['cors_origin']);
    header('Access-Control-Allow-Credentials: true');
}
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
    exit;
}

function db(): PDO {
    static $pdo = null;
    global $config;
    if ($pdo instanceof PDO) return $pdo;

    $url = trim((string)$config['db']['url']);
    if ($url !== '') {
        $parts = parse_url($url);
        if ($parts === false || empty($parts['host']) || empty($parts['path'])) {
            throw new RuntimeException('DATABASE_URL không hợp lệ');
        }
        $host = $parts['host'];
        $port = (string)($parts['port'] ?? 5432);
        $name = ltrim($parts['path'], '/');
        $user = isset($parts['user']) ? rawurldecode($parts['user']) : '';
        $pass = isset($parts['pass']) ? rawurldecode($parts['pass']) : '';
        $query = [];
        if (!empty($parts['query'])) parse_str($parts['query'], $query);
        $sslmode = (string)($query['sslmode'] ?? $config['db']['sslmode']);
    } else {
        $host = $config['db']['host'];
        $port = $config['db']['port'];
        $name = $config['db']['name'];
        $user = $config['db']['user'];
        $pass = $config['db']['pass'];
        $sslmode = $config['db']['sslmode'];
    }

    $dsn = sprintf('pgsql:host=%s;port=%s;dbname=%s;sslmode=%s', $host, $port, $name, $sslmode);
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}
function body(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') return $_POST ?: [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}
function ok(array $data = [], int $status = 200): never {
    http_response_code($status); echo json_encode(['ok'=>true] + $data, JSON_UNESCAPED_UNICODE); exit;
}
function fail(string $message, int $status = 400, array $extra = []): never {
    http_response_code($status); echo json_encode(['ok'=>false,'error'=>$message] + $extra, JSON_UNESCAPED_UNICODE); exit;
}
function user(): ?array {
    if (empty($_SESSION['user_id'])) return null;
    $st = db()->prepare('SELECT u.id,u.username,u.email,u.role,u.status,w.balance FROM users u JOIN wallets w ON w.user_id=u.id WHERE u.id=? LIMIT 1');
    $st->execute([(int)$_SESSION['user_id']]);
    $u = $st->fetch();
    return $u ?: null;
}
function require_user(): array { $u = user(); if (!$u) fail('Chưa đăng nhập', 401); return $u; }
function require_admin(): array { $u = require_user(); if ($u['role'] !== 'admin') fail('Không có quyền', 403); return $u; }
function csrf(): string { if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(24)); return $_SESSION['csrf']; }
function check_csrf(): void {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') return;
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? (body()['_csrf'] ?? '');
    if (!hash_equals(csrf(), (string)$token)) fail('CSRF token không hợp lệ', 419);
}
