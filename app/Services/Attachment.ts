import Attachment from 'App/Models/Attachment'
import NotFoundException from 'App/Exceptions/NotFoundException'

import storage from 'App/Services/Storage'

const deleteAttachment = async (attachmentId: number) => {
  const attachment = await Attachment.find(attachmentId)
  if (!attachment) throw new NotFoundException('Attachment not found', 404, 'NOT_FOUND')
  await storage.deleteFile(attachment.url)
  await attachment.related('contracts').detach()
  return attachment.delete()
}

const uploadAttachment = async (file: string): Promise<Attachment> => {
  try {
    const fileUrl = await storage.uploadFile(file)
    const attachment = await Attachment.create({ url: fileUrl })
    return attachment
  } catch (error) {
    throw error
  }
}

const getAttachment = async (attachmentId: number): Promise<Attachment> => {
  const attachment = await Attachment.find(attachmentId)
  if (!attachment) throw new NotFoundException('Attachment not found', 404, 'NOT_FOUND')
  attachment.url = storage.generateSasToken(attachment.url)
  return attachment
}

export default {
  uploadAttachment,
  deleteAttachment,
  getAttachment,
}
