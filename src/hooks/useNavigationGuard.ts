"use client";

import { useEffect, useCallback, useRef } from "react";

const GUARD_MESSAGE = "יש ייצור מודעות פעיל. בטוח שאתה רוצה לעזוב? כל ההתקדמות תאבד.";

export function useNavigationGuard(isActive: boolean) {
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const historyPushedRef = useRef(false);

  // 1. beforeunload — catches tab close, refresh, URL change
  useEffect(() => {
    if (!isActive) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore custom message but still show a prompt
      e.returnValue = GUARD_MESSAGE;
      return GUARD_MESSAGE;
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isActive]);

  // 2. popstate — catches Mac trackpad swipe back, browser back/forward buttons
  useEffect(() => {
    if (!isActive) {
      historyPushedRef.current = false;
      return;
    }

    // Push a dummy history entry so we can intercept "back"
    if (!historyPushedRef.current) {
      window.history.pushState({ navigationGuard: true }, "");
      historyPushedRef.current = true;
    }

    const handler = () => {
      if (!isActiveRef.current) return;

      const userConfirmed = window.confirm(GUARD_MESSAGE);
      if (userConfirmed) {
        // User wants to leave — allow by going back again
        historyPushedRef.current = false;
        window.history.back();
      } else {
        // User cancelled — re-push the dummy entry to stay
        window.history.pushState({ navigationGuard: true }, "");
      }
    };

    window.addEventListener("popstate", handler);
    return () => {
      window.removeEventListener("popstate", handler);
    };
  }, [isActive]);

  // 3. In-app navigation wrapper
  const confirmNavigation = useCallback(
    (callback: () => void) => {
      if (!isActiveRef.current) {
        callback();
        return;
      }
      const userConfirmed = window.confirm(GUARD_MESSAGE);
      if (userConfirmed) {
        callback();
      }
    },
    []
  );

  return { confirmNavigation };
}
