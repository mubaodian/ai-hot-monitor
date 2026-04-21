import nodemailer from 'nodemailer';

function createTransporter(settings) {
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port: Number(settings.smtpPort || 587),
    secure: Boolean(settings.smtpSecure),
    auth: settings.smtpUser
      ? {
          user: settings.smtpUser,
          pass: settings.smtpPass
        }
      : undefined
  });
}

export async function verifyEmailSettings(settings) {
  if (!settings.smtpHost || !settings.emailTo) {
    throw new Error('SMTP 主机或收件人未配置');
  }

  const transporter = createTransporter(settings);
  await transporter.verify();
  return true;
}

export async function sendFindingEmail(settings, watcher, finding) {
  if (!settings.smtpHost || !settings.emailTo || !settings.emailFrom) {
    throw new Error('邮件配置不完整');
  }

  const transporter = createTransporter(settings);
  const decision = finding.aiDecision || {};

  await transporter.sendMail({
    from: settings.emailFrom,
    to: settings.emailTo,
    subject: `[AI Hot Monitor] ${watcher.name}: ${finding.title}`,
    text: [
      `监控任务: ${watcher.name}`,
      `标题: ${finding.title}`,
      `链接: ${finding.url}`,
      `来源: ${finding.sourceName}`,
      `热度: ${decision.heatScore ?? '--'}`,
      `可信度: ${decision.credibility || 'unknown'}`,
      `摘要: ${decision.summary || finding.snippet || ''}`,
      `原因: ${decision.reason || ''}`
    ].join('\n'),
    html: `
      <h2>${watcher.name}</h2>
      <p><strong>标题:</strong> ${finding.title}</p>
      <p><strong>链接:</strong> <a href="${finding.url}">${finding.url}</a></p>
      <p><strong>来源:</strong> ${finding.sourceName}</p>
      <p><strong>热度:</strong> ${decision.heatScore ?? '--'}</p>
      <p><strong>可信度:</strong> ${decision.credibility || 'unknown'}</p>
      <p><strong>摘要:</strong> ${decision.summary || finding.snippet || ''}</p>
      <p><strong>原因:</strong> ${decision.reason || ''}</p>
    `
  });
}
