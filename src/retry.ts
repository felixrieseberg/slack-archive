export interface RetryOptions {
  retries: number;
  name?: string;
}

const defaultOptions: RetryOptions = {
  retries: 3,
};

export async function retry<T>(
  options: Partial<RetryOptions>,
  operation: () => T,
  attempt = 0
): Promise<T> {
  let mergedOptions = { ...defaultOptions, ...options };

  try {
    return operation();
  } catch (error) {
    if (attempt >= mergedOptions.retries) {
      throw error;
    }

    const ms = 250 + attempt * 250;

    if (mergedOptions.name) {
      console.warn(`Operation "${options.name}" failed, retrying in ${ms}`);
    }

    await wait(ms);

    return retry(options, operation, attempt + 1);
  }
}

function wait(ms = 250) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
