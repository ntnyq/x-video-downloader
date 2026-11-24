import { ReplayFormatError } from './errors'

/**
 * Byte length of a standard MPEG-TS packet.
 */
const PACKET_SIZE = 188

/**
 * Rejects incomplete or misaligned transport packets before staging the segment.
 * @param bytes - Downloaded MPEG-TS segment.
 * @throws {ReplayFormatError} When no complete transport packet sequence is present.
 */
export function validateReplayTransportSegment(bytes: Uint8Array) {
  if (bytes.length === 0 || bytes.length % PACKET_SIZE !== 0) {
    throw new ReplayFormatError()
  }

  for (let offset = 0; offset < bytes.length; offset += PACKET_SIZE) {
    if (bytes[offset] !== 0x47) {
      throw new ReplayFormatError()
    }
  }
}
