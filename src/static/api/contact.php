<?php
/**
 * Enquiry form handler for krishasolutions.net.
 *
 * Validates the contact form, applies basic spam protection and emails the
 * enquiry to the address set in site.config.json ("form.recipient").
 * Settings are read from contact-config.php, which build.mjs generates.
 *
 * Responds with JSON when the request asks for it (the page's JavaScript does),
 * otherwise redirects back to the website.
 */

declare(strict_types=1);

$config = require __DIR__ . '/contact-config.php';

const SERVICES = [
    'managed-it' => 'Managed IT services and technical support',
    'infrastructure' => 'IT infrastructure and networking',
    'cloud' => 'Cloud services, hosting and backup',
    'software' => 'Software implementation and customisation',
    'consulting' => 'IT consulting and project management',
    'web' => 'Website and e-commerce development',
    'hardware' => 'IT hardware and equipment',
    'krishasure' => 'KrishaSure (demo or pilot)',
    'other' => 'Something else, or not sure yet',
];

const BUSINESS_TYPES = [
    'accounting' => 'Accounting or audit firm',
    'law' => 'Law firm',
    'professional-services' => 'Consulting or professional services',
    'logistics' => 'Logistics or distribution',
    'engineering' => 'Engineering or construction',
    'ngo' => 'NGO',
    'other' => 'Other',
];

const EMPLOYEE_RANGES = [
    '1-19' => '1 to 19',
    '20-50' => '20 to 50',
    '51-100' => '51 to 100',
    '101-150' => '101 to 150',
    '150+' => 'More than 150',
];

const RATE_LIMIT_MAX = 5;          // submissions allowed...
const RATE_LIMIT_WINDOW = 3600;    // ...per IP address per hour
const MIN_FILL_SECONDS = 3;        // faster than this is almost certainly a bot

$wantsJson = strpos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false;

function respond(bool $ok, int $status, string $message, array $errors = []): void
{
    global $wantsJson;
    if ($wantsJson) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode(['ok' => $ok, 'message' => $message, 'errors' => (object) $errors]);
    } else {
        header('Location: ' . ($ok ? '/contact/thank-you/' : '/contact/?status=error#enquiry'), true, 303);
    }
    exit;
}

function text_length(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

function field(string $name): string
{
    $value = $_POST[$name] ?? '';
    return is_string($value) ? trim($value) : '';
}

/** Removes characters that could be used to inject extra email headers. */
function header_safe(string $value): string
{
    return trim(preg_replace('/[\r\n\t]+/', ' ', $value) ?? '');
}

function encode_header(string $value): string
{
    return '=?UTF-8?B?' . base64_encode($value) . '?=';
}

function rate_limited(string $ip): bool
{
    $file = rtrim(sys_get_temp_dir(), '/\\') . '/ks-contact-' . hash('sha256', $ip . __FILE__);
    $now = time();
    $times = [];
    if (is_file($file)) {
        $decoded = json_decode((string) @file_get_contents($file), true);
        if (is_array($decoded)) {
            $times = array_values(array_filter($decoded, function ($t) use ($now) {
                return is_int($t) && $t > $now - RATE_LIMIT_WINDOW;
            }));
        }
    }
    if (count($times) >= RATE_LIMIT_MAX) {
        return true;
    }
    $times[] = $now;
    @file_put_contents($file, json_encode($times), LOCK_EX);
    return false;
}

// ---------------------------------------------------------------------------

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    respond(false, 405, 'Please use the enquiry form on the contact page.');
}

if (empty($config['enabled']) || empty($config['to'])) {
    respond(false, 503, 'The enquiry form is not available at the moment. Please contact us on WhatsApp.');
}

// Spam check 1: hidden "website" field that only bots fill in.
// Pretend it worked so the bot has no reason to try again.
if (field('website') !== '') {
    respond(true, 200, 'Thank you. Your enquiry has been sent.');
}

// Spam check 2: form submitted impossibly quickly after the page loaded.
$started = field('started');
if (ctype_digit($started) && (microtime(true) * 1000 - (float) $started) < MIN_FILL_SECONDS * 1000) {
    respond(false, 400, 'That was very quick. Please wait a moment and send the form again.');
}

$data = [
    'name' => field('name'),
    'company' => field('company'),
    'email' => field('email'),
    'phone' => field('phone'),
    'business_type' => field('business_type'),
    'employees' => field('employees'),
    'service' => field('service'),
    'message' => field('message'),
    'consent' => field('consent'),
];

$errors = [];
if (text_length($data['name']) < 2 || text_length($data['name']) > 100) {
    $errors['name'] = 'Please enter your name.';
}
if ($data['company'] === '' || text_length($data['company']) > 150) {
    $errors['company'] = 'Please enter your company name.';
}
if (strlen($data['email']) > 254 || !filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'Please enter a valid email address.';
}
if (!preg_match('/^\+?[0-9\s()\-]{7,20}$/', $data['phone'])) {
    $errors['phone'] = 'Please enter a valid phone number.';
}
if ($data['business_type'] !== '' && !isset(BUSINESS_TYPES[$data['business_type']])) {
    $errors['business_type'] = 'Please choose an option from the list.';
}
if ($data['employees'] !== '' && !isset(EMPLOYEE_RANGES[$data['employees']])) {
    $errors['employees'] = 'Please choose an option from the list.';
}
if (!isset(SERVICES[$data['service']])) {
    $errors['service'] = 'Please choose the service you need.';
}
$messageLength = text_length($data['message']);
if ($messageLength < 10 || $messageLength > 3000) {
    $errors['message'] = $messageLength > 3000
        ? 'Please keep your message under 3,000 characters.'
        : 'Please tell us a little more (at least 10 characters).';
} elseif (preg_match_all('~https?://|www\.~i', $data['message']) > 3) {
    $errors['message'] = 'Please include fewer web links in your message.';
}
if ($data['consent'] !== 'yes') {
    $errors['consent'] = 'Please confirm that we may use your details to respond.';
}

if ($errors) {
    respond(false, 422, 'Please check the highlighted fields.', $errors);
}

$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
if (rate_limited($ip)) {
    respond(false, 429, 'We have received several messages from you already. Please contact us on WhatsApp instead.');
}

// ---------------------------------------------------------------------------
// Send the email

$serviceLabel = SERVICES[$data['service']];
$subject = 'Website enquiry: ' . $serviceLabel . ' - ' . header_safe($data['company']);

$lines = [
    'New enquiry from the krishasolutions.net contact form.',
    '',
    'Name:            ' . $data['name'],
    'Company:         ' . $data['company'],
    'Email:           ' . $data['email'],
    'Phone:           ' . $data['phone'],
    'Type of business: ' . ($data['business_type'] !== '' ? BUSINESS_TYPES[$data['business_type']] : 'Not given'),
    'Employees/users: ' . ($data['employees'] !== '' ? EMPLOYEE_RANGES[$data['employees']] : 'Not given'),
    'Service:         ' . $serviceLabel,
    '',
    'Message:',
    $data['message'],
    '',
    '---',
    'Sent: ' . gmdate('Y-m-d H:i') . ' UTC',
    'Reply to this email to respond directly to ' . header_safe($data['name']) . '.',
];
$body = str_replace(["\r\n", "\r"], "\n", implode("\n", $lines));

$from = header_safe((string) $config['from']);
$headers = [
    'From: ' . encode_header(header_safe((string) $config['siteName']) . ' Website') . ' <' . $from . '>',
    'Reply-To: ' . $data['email'],
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'X-Mailer: krishasolutions.net',
];

/**
 * Sends through Resend (https://resend.com) when an API key is configured.
 * Resend signs the email for krishasolutions.net, so Microsoft 365 trusts it.
 */
function send_with_resend(array $config, string $subject, string $body, string $replyTo): bool
{
    if (!function_exists('curl_init')) {
        error_log('contact.php: curl is not available for Resend');
        return false;
    }
    $payload = json_encode([
        'from' => header_safe((string) $config['siteName']) . ' Website <' . header_safe((string) $config['from']) . '>',
        'to' => [(string) $config['to']],
        'reply_to' => $replyTo,
        'subject' => $subject,
        'text' => $body,
    ]);
    $ch = curl_init('https://api.resend.com/emails');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $config['resendKey'],
            'Content-Type: application/json',
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
    ]);
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    if ($status >= 200 && $status < 300) {
        return true;
    }
    error_log('contact.php: Resend failed (HTTP ' . $status . ') ' . $error . ' ' . substr((string) $response, 0, 300));
    return false;
}

$sent = false;
if (!empty($config['resendKey'])) {
    $sent = send_with_resend($config, $subject, $body, $data['email']);
}
if (!$sent) {
    // Fallback: the hosting server's own mail system.
    $sent = @mail(
        (string) $config['to'],
        encode_header($subject),
        $body,
        implode("\r\n", $headers),
        '-f' . $from
    );
}

if (!$sent) {
    respond(false, 500, 'Sorry, we could not send your message just now. Please try again later or contact us on WhatsApp.');
}

respond(true, 200, 'Thank you. Your enquiry has been sent.');
