import { notify } from '@affine/component';
import {
  AuthContent,
  BackButton,
  CountDownRender,
  ModalHeader,
} from '@affine/component/auth-components';
import { Button } from '@affine/component/ui/button';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { AuthService, CaptchaService } from '@affine/core/modules/cloud';
import { Unreachable } from '@affine/env/constant';
import { Trans, useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
} from 'react';

import type { SignInState } from '.';
import { Captcha } from './captcha';
import * as style from './style.css';

export const SignInWithEmailStep = ({
  state,
  changeState,
  close,
}: {
  state: SignInState;
  changeState: Dispatch<SetStateAction<SignInState>>;
  close: () => void;
}) => {
  const [resendCountDown, setResendCountDown] = useState(60);

  const email = state.email;

  if (!email) {
    throw new Unreachable();
  }

  useEffect(() => {
    const timer = setInterval(() => {
      setResendCountDown(c => Math.max(c - 1, 0));
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const [isSending, setIsSending] = useState(false);

  const t = useI18n();
  const authService = useService(AuthService);
  const captchaService = useService(CaptchaService);

  const verifyToken = useLiveData(captchaService.verifyToken$);
  const needCaptcha = useLiveData(captchaService.needCaptcha$);
  const challenge = useLiveData(captchaService.challenge$);

  const loginStatus = useLiveData(authService.session.status$);

  useEffect(() => {
    if (loginStatus === 'authenticated') {
      close();
      notify.success({
        title: t['com.affine.auth.toast.title.signed-in'](),
        message: t['com.affine.auth.toast.message.signed-in'](),
      });
    }
  }, [close, loginStatus, t]);

  const onResendClick = useAsyncCallback(async () => {
    if (isSending || (!verifyToken && needCaptcha)) return;
    setIsSending(true);
    try {
      setResendCountDown(60);
      captchaService.revalidate();
      await authService.sendEmailMagicLink(
        email,
        verifyToken,
        challenge,
        state.redirectUrl
      );
    } catch (err) {
      console.error(err);
      notify.error({
        title: 'Failed to send email, please try again.',
      });
    }
    setIsSending(false);
  }, [
    authService,
    captchaService,
    challenge,
    email,
    isSending,
    needCaptcha,
    state.redirectUrl,
    verifyToken,
  ]);

  const onSignInWithPasswordClick = useCallback(() => {
    changeState(prev => ({ ...prev, step: 'signInWithPassword' }));
  }, [changeState]);

  const onBackBottomClick = useCallback(() => {
    changeState(prev => ({ ...prev, step: 'signIn' }));
  }, [changeState]);

  return !verifyToken && needCaptcha ? (
    <>
      <ModalHeader title={t['com.affine.auth.sign.in']()} />
      <AuthContent style={{ height: 100 }}>
        <Captcha />
      </AuthContent>
      <BackButton onClick={onBackBottomClick} />
    </>
  ) : (
    <>
      <ModalHeader
        title={t['com.affine.auth.sign.in']()}
        subTitle={t['com.affine.auth.sign.in.sent.email.subtitle']()}
      />
      <AuthContent style={{ height: 100 }}>
        <Trans
          i18nKey="com.affine.auth.sign.sent.email.message.sent-tips"
          values={{ email }}
          components={{ a: <a href={`mailto:${email}`} /> }}
        />
        {t['com.affine.auth.sign.sent.email.message.sent-tips.sign-in']()}
      </AuthContent>

      <div className={style.resendWrapper}>
        {resendCountDown <= 0 ? (
          <Button
            disabled={isSending}
            variant="plain"
            size="large"
            onClick={onResendClick}
          >
            {t['com.affine.auth.sign.auth.code.resend.hint']()}
          </Button>
        ) : (
          <div className={style.sentRow}>
            <div className={style.sentMessage}>
              {t['com.affine.auth.sent']()}
            </div>
            <CountDownRender
              className={style.resendCountdown}
              timeLeft={resendCountDown}
            />
          </div>
        )}
      </div>

      <div className={style.authMessage} style={{ marginTop: 20 }}>
        {t['com.affine.auth.sign.auth.code.message']()}
        &nbsp;
        <Trans
          i18nKey="com.affine.auth.sign.auth.code.message.password"
          components={{
            1: (
              <span
                className="link"
                data-testid="sign-in-with-password"
                onClick={onSignInWithPasswordClick}
              />
            ),
          }}
        />
      </div>

      <BackButton onClick={onBackBottomClick} />
    </>
  );
};
