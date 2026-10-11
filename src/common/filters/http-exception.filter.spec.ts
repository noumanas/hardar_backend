import {
  type ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { HttpExceptionFilter } from './http-exception.filter.js';

function hostFor(url = '/api/v1/things') {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', url: '/things', originalUrl: url }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it('keeps the status and message of an HttpException', () => {
    const { host, status, json } = hostFor();
    filter.catch(new NotFoundException('Law article 1 not found'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'Law article 1 not found',
        path: '/api/v1/things',
      }),
    );
  });

  it('passes validation messages through as a list', () => {
    const { host, json } = hostFor();
    filter.catch(new BadRequestException(['salary must be positive', 'endDate is required']), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: ['salary must be positive', 'endDate is required'] }),
    );
  });

  it('uses the exception message when the response is a plain string', () => {
    const { host, json } = hostFor();
    filter.catch(new HttpException('Teapot', HttpStatus.I_AM_A_TEAPOT), host);

    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 418, message: 'Teapot' }));
  });

  it('hides unexpected errors behind a generic 500 and logs them', () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { host, status, json } = hostFor();
    filter.catch(new Error('connection string leaked'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Internal server error' }));
    expect(log).toHaveBeenCalledOnce();
  });
});
