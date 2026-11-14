import { describe, expect, it } from 'vitest';
import { SIGNUP_DISABLED_ERROR } from '@effinance/shared';
import { ApiRequestError } from '@/lib/api';
import { inviteTokenFrom, isSignupClosed } from './register';

describe('sign-up by invite (register page)', () => {
  it('reads the invite token of the page the visitor came from', () => {
    expect(inviteTokenFrom('/convite/abcDEF123_-xyz')).toBe('abcDEF123_-xyz');
    expect(inviteTokenFrom(`/convite/${encodeURIComponent('a b')}`)).toBe('a b');
    expect(inviteTokenFrom('/')).toBeUndefined();
    expect(inviteTokenFrom('/convite')).toBeUndefined();
    expect(inviteTokenFrom('/convite/x/y')).toBeUndefined();
    expect(inviteTokenFrom('/convite/%E0%A4%A')).toBeUndefined();
  });

  it('recognizes the refusal of a closed sign-up (and nothing else)', () => {
    const closed = new ApiRequestError(403, { error: SIGNUP_DISABLED_ERROR, message: 'O cadastro é feito por convite do escritório.' });
    expect(isSignupClosed(closed)).toBe(true);
    expect(isSignupClosed(new ApiRequestError(403, { error: 'forbidden', message: 'x' }))).toBe(false);
    expect(isSignupClosed(new Error('x'))).toBe(false);
  });
});
