<?php

use PHPMailer\PHPMailer\PHPMailer;

require __DIR__ . '/phpmailer/src/Exception.php';
require __DIR__ . '/phpmailer/src/PHPMailer.php';
require __DIR__ . '/phpmailer/src/SMTP.php';

$mail = new PHPMailer(true);

try {

    $mail->isSMTP();
    $mail->Host = getenv('IECMS_SMTP_HOST') ?: 'smtp.gmail.com';
    $mail->SMTPAuth = true;
    $mail->Username = getenv('IECMS_SMTP_USER') ?: '';
    $mail->Password = getenv('IECMS_SMTP_PASSWORD') ?: '';
    $mail->SMTPSecure = getenv('IECMS_SMTP_ENCRYPTION') ?: PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Port = (int)(getenv('IECMS_SMTP_PORT') ?: 587);

    $from = getenv('IECMS_MAIL_FROM_EMAIL') ?: $mail->Username;
    $recipient = getenv('IECMS_SMTP_TEST_RECIPIENT') ?: '';
    if ($mail->Username === '' || $mail->Password === '' || $recipient === '') {
        throw new RuntimeException('Configure IECMS_SMTP_USER, IECMS_SMTP_PASSWORD, and IECMS_SMTP_TEST_RECIPIENT before testing.');
    }
    $mail->setFrom($from, getenv('IECMS_MAIL_FROM_NAME') ?: 'QUIMS System');
    $mail->addAddress($recipient);

    $mail->Subject = 'QUIMS Test Email';
    $mail->Body = 'If you received this, PHPMailer is working perfectly!';

    $mail->send();

    echo "Email sent successfully";

} catch (Throwable $e) {
    echo "Mailer Error: " . $e->getMessage();
}