export type MailAttachment = { name: string; alt?: string };
export function attachmentsFor(letter: {
  attachment?: string;
  attachmentAlt?: string;
  attachments?: MailAttachment[];
}): MailAttachment[];
