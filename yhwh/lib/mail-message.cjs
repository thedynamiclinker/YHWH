const yhwhAddress = 'root@thedynamiclinker.com';

function address(value) {
  if (typeof value !== 'string' || value.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(value)) {
    throw new Error('Enter a single email address.');
  }
  return value;
}

function message({ to, subject, body }, self) {
  if (to === 'self' && !self) throw new Error('Set your email address in Settings → Advanced first.');
  if (typeof subject !== 'string' || !subject.trim() || /[\r\n\0]/.test(subject) || subject.length > 200) throw new Error('Enter a single-line subject of up to 200 characters.');
  if (typeof body !== 'string' || !body.trim() || body.length > 30000) throw new Error('Enter a message of up to 30,000 characters.');
  return { to: address(to === 'self' ? self : to), subject, body };
}

function draft({ to, subject, body }) {
  const recipient = encodeURIComponent(to).replace('%40', '@');
  return `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

module.exports = { address, message, draft, yhwhAddress };
