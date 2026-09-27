import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from 'mcp-handler';
import { getIssuer } from '../../../lib/jwt';

/**
 * This is the critical fix from the original (broken) design: authServerUrls
 * points at OUR OWN issuer (which mints RFC-8707-compliant, resource-bound
 * tokens) rather than Google directly (which can't).
 */
const handler = protectedResourceHandler({
  authServerUrls: [getIssuer()],
});

const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
