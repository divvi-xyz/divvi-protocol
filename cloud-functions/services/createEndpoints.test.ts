import mocked = jest.mocked
import { getLoggingMiddleware, logger } from '../log'
import { createEndpoint } from './createEndpoint'
import { Request, Response } from '@google-cloud/functions-framework'
import { asyncHandler } from '@valora/http-handler'

jest.mock('../log')
jest.mock('@valora/http-handler')

describe('createEndpoint', () => {
  it('wraps a function with logging middleware and async handler', () => {
    const mockLoggingMiddleware = jest
      .fn()
      .mockImplementation((req, res, next) => next(req, res)) // this mock just lets us check that 'next' is set to the httpFunction parameter given to 'wrap'
    mocked(getLoggingMiddleware).mockReturnValue(mockLoggingMiddleware)
    const mockHttpFunction = jest.fn()
    const mockAsyncHttpFunction = jest.fn()
    mocked(asyncHandler).mockReturnValue(mockAsyncHttpFunction)
    const mockLoadConfig = jest
      .fn()
      .mockReturnValue({ GCLOUD_PROJECT: 'test-gcloud-project' })
    const testEndpoint = createEndpoint('test-endpoint', {
      loadConfig: mockLoadConfig,
      requestSchema: {} as any,
      handler: mockHttpFunction,
    })
    expect(mockLoadConfig).not.toHaveBeenCalled() // don't call loadConfig until the wrapped function is called
    expect(asyncHandler).toHaveBeenCalledWith(expect.anything(), logger)
    const mockReq = {} as Request
    const mockRes = {} as Response
    testEndpoint.handler(mockReq, mockRes)
    expect(mockLoadConfig).toHaveBeenCalled()
    expect(getLoggingMiddleware).toHaveBeenCalledWith('test-gcloud-project')
    expect(mockLoggingMiddleware).toHaveBeenCalledWith(
      mockReq,
      mockRes,
      expect.any(Function),
    )
    expect(mockAsyncHttpFunction).toHaveBeenCalledWith(mockReq, mockRes)
  })
})
