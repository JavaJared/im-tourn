import { forwardRef } from 'react';
export const buttonClass = (variant = 'secondary', className = '') => `ui-button ui-button--${variant} ${className}`.trim();
export const Button = forwardRef(function Button({ variant = 'secondary', className = '', type = 'button', ...props }, ref) {
  return <button ref={ref} type={type} className={buttonClass(variant, className)} {...props}/>;
});
