// Minimal stand-in for "react" and "react/jsx-runtime" so the Paper Shaders React
// components can be bundled WITHOUT React. We never render them: we call the
// component function once to get Paper's own params -> uniforms mapping
// (colors, enums, sizing, noise texture), then mount the vanilla ShaderMount.
//
// memo(fn) returns a tagged object so hf-paper.js can find the inner function.
export const memo = (fn) => ({ $$paper: true, type: fn });
export const forwardRef = (fn) => fn;
export const useEffect = () => {};
export const useLayoutEffect = () => {};
export const useRef = (v) => ({ current: v });
export const useState = (v) => [typeof v === "function" ? v() : v, () => {}];
export const useMemo = (fn) => fn();
export const useCallback = (fn) => fn;
export const jsx = (type, props) => ({ type, props });
export const jsxs = jsx;
export const Fragment = "Fragment";
const React = { memo, forwardRef, useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback, createElement: (t, p) => ({ type: t, props: p }) };
export default React;
