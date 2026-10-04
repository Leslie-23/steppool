import { router } from 'expo-router';
import { useEffect } from 'react';

/** Landing for steppool://paid (Paystack's return). The pay flow handles the result; this just steps out of the way. */
export default function Paid() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);
  return null;
}
