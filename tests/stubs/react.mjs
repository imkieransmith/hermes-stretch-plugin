export const useState = init => [typeof init === 'function' ? init() : init, () => {}]
export const useEffect = () => {}
export default { useState, useEffect }
