// Copy and templates are data. Numbered slots keep interpolation in the code.
exports.text = copy => (key, ...values) => copy[key].replace(/\{\{(\d+)\}\}/g, (_, i) => String(values[Number(i)]));
