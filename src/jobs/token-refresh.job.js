export async function tokenRefreshJob(fastify) {
  try {
    console.log('[TokenRefreshJob] Starting token refresh...');
    await fastify.tokenManager.refresh();
    console.log('[TokenRefreshJob] Token refresh completed');
  } catch (error) {
    console.error('[TokenRefreshJob] Failed:', error.message);
    throw error;
  }
}
