exports.quote = value => "\'" + String(value).replaceAll("\'", "\'\\\'\'") + "\'";
