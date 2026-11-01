import {useEffect, useState} from 'react';
// 기존 키(fhh-button-size, fhh-font, fhh-theme)와 호환되는 화면 설정 저장
function usePersisted(key, initial) {
  const [value, setValue] = useState(() => { try { return JSON.parse(localStorage.getItem(key)) ?? initial; } catch { return initial; } });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }, [key, value]);
  return [value, setValue];
}
export const FONT_STEPS = ['작게', '보통', '크게', '매우 크게'];
export function useUiPrefs() {
  const [buttonSize, setButtonSize] = usePersisted('fhh-button-size', 44), [font, setFont] = usePersisted('fhh-font', '보통'), [theme, setTheme] = usePersisted('fhh-theme', '자동'), [contrast, setContrast] = usePersisted('fhh-contrast', false);
  const [onboarded, setOnboarded] = usePersisted('fhh-onboarded', false);
  return {buttonSize, setButtonSize, font, setFont, theme, setTheme, contrast, setContrast, onboarded, setOnboarded};
}
export const fontClass = f => f === '매우 크게' ? 'font-xl' : f === '크게' ? 'font-lg' : f === '작게' ? 'font-sm' : '';
