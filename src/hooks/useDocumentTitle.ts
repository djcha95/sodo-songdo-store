// src/hooks/useDocumentTitle.ts
import { useEffect } from 'react';

const useDocumentTitle = (title: string, prevailOnUnmount = false) => {
  useEffect(() => {
    document.title = `${title} - 소도몰 관리자`;
  }, [title]);

  useEffect(() => () => {
    if (!prevailOnUnmount) {
      document.title = '소도몰 관리자';
    }
  }, [prevailOnUnmount]);
};

export default useDocumentTitle;