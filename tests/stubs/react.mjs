export const useState = init => [typeof init === 'function' ? init() : init, () => {}]
export const useEffect = () => {}
export const useRef = init => ({ current: init })
export default { useState, useEffect, useRef }
