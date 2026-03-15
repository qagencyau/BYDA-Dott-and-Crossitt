export class EnquiryPoller {
  timer = null;
  isRunning = false;
  stats = {
    isRunning: false,
    totalRuns: 0,
    pendingCount: 0,
    lastRunAt: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastErrorMessage: null,
  };

  constructor(store, bydaClient, intervalMs, logger, maxFailures = 5) {
    this.store = store;
    this.bydaClient = bydaClient;
    this.intervalMs = intervalMs;
    this.logger = logger;
    this.maxFailures = maxFailures;
  }

  start() {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);

    this.logger?.info("Enquiry poller started.", {
      intervalMs: this.intervalMs,
      maxFailures: this.maxFailures,
    });
    void this.tick();
  }

  stop() {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
    this.logger?.info("Enquiry poller stopped.");
  }

  async tick() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.stats.isRunning = true;
    this.stats.totalRuns += 1;
    this.stats.lastRunAt = new Date().toISOString();

    try {
      const pending = await this.store.listPending();
      this.stats.pendingCount = pending.length;

      for (const record of pending) {
        if (record.mode === "mock") {
          await this.refreshMock(record);
          continue;
        }

        await this.refreshLive(record);
      }

      this.stats.lastSuccessAt = new Date().toISOString();
      this.stats.lastErrorAt = null;
      this.stats.lastErrorMessage = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown poller error";
      this.stats.lastErrorAt = new Date().toISOString();
      this.stats.lastErrorMessage = message;
      this.logger?.error("Poller tick failed.", { error });
    } finally {
      this.isRunning = false;
      this.stats.isRunning = false;
    }
  }

  async refreshMock(record) {
    const createdAt = new Date(record.createdAt).getTime();
    if (Date.now() - createdAt < 8_000) {
      return;
    }

    await this.store.update(record.token, (current) => ({
      ...current,
      status: "ready",
      pollFailures: 0,
      message: "Mock report is ready.",
      fileUrl: `/mock-reports/${current.token}`,
      error: null,
      updatedAt: new Date().toISOString(),
      lastPolledAt: new Date().toISOString(),
    }));
  }

  async refreshLive(record) {
    if (!record.bydaEnquiryId) {
      return;
    }

    try {
      const detail = await this.bydaClient.getEnquiry(record.bydaEnquiryId);
      const shareUrl = record.shareUrl ?? (await this.bydaClient.getShareLink(record.bydaEnquiryId));
      let combinedFileId = record.combinedFileId;
      let combinedJobId = record.combinedJobId;
      let fileUrl = record.fileUrl ?? null;

      if (!combinedFileId) {
        const downloadRequest = await this.bydaClient.requestCombinedZip(record.bydaEnquiryId);
        combinedFileId = downloadRequest.File?.id;
        combinedJobId = downloadRequest.Job?.id;
      }

      if (combinedFileId && !fileUrl) {
        fileUrl = await this.bydaClient.probeFileUrl(combinedFileId);
      }

      await this.store.update(record.token, (current) => ({
        ...current,
        status: fileUrl ? "ready" : "processing",
        pollFailures: 0,
        message: fileUrl
          ? "Combined BYDA report is ready."
          : shareUrl
            ? "Enquiry lodged. BYDA share link available while the combined report is still processing."
            : "Enquiry lodged. Waiting for combined BYDA report generation.",
        bydaStatus: detail.status ?? current.bydaStatus,
        shareUrl: shareUrl ?? current.shareUrl,
        fileUrl: fileUrl ?? current.fileUrl,
        combinedFileId: combinedFileId ?? current.combinedFileId,
        combinedJobId: combinedJobId ?? current.combinedJobId,
        error: null,
        updatedAt: new Date().toISOString(),
        lastPolledAt: new Date().toISOString(),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown polling error";
      this.stats.lastErrorAt = new Date().toISOString();
      this.stats.lastErrorMessage = message;
      this.logger?.warn("Polling refresh failed.", {
        token: record.token,
        enquiryId: record.bydaEnquiryId,
        error,
      });

      await this.store.update(record.token, (current) => ({
        ...current,
        pollFailures: (current.pollFailures ?? 0) + 1,
        status:
          current.status === "ready"
            ? "ready"
            : (current.pollFailures ?? 0) + 1 >= this.maxFailures
              ? "failed"
              : "processing",
        message:
          current.status === "ready"
            ? current.message
            : (current.pollFailures ?? 0) + 1 >= this.maxFailures
              ? "Failed to refresh BYDA enquiry state repeatedly."
              : "Temporary BYDA polling issue. The system will retry automatically.",
        error: message,
        updatedAt: new Date().toISOString(),
        lastPolledAt: new Date().toISOString(),
      }));
    }
  }

  getStats() {
    return {
      ...this.stats,
      intervalMs: this.intervalMs,
      maxFailures: this.maxFailures,
    };
  }
}
