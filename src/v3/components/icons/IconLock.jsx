import PropTypes from 'prop-types';
import { SvgIcon } from '@mui/material';

const IconLock = ({ color = '#222222', width = 24, height = 24, sx = {} }) => {
  width = width.toString();
  height = height.toString();

  return (
    <SvgIcon id="organized-icon-lock" sx={{ width: `${width}px`, height: `${height}px`, ...sx }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <mask
          id="mask0_2674_31399"
          style={{ maskType: 'alpha' }}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="24"
          height="24"
        >
          <rect width="24" height="24" fill="#D9D9D9" />
        </mask>
        <g mask="url(#mask0_2674_31399)">
          <path
            d="M6.3077 21.5C5.80898 21.5 5.38302 21.3234 5.02982 20.9702C4.67661 20.617 4.5 20.191 4.5 19.6923V10.3078C4.5 9.80906 4.67661 9.3831 5.02982 9.0299C5.38302 8.67668 5.80898 8.50007 6.3077 8.50007H7.5V6.50007C7.5 5.25137 7.93782 4.18921 8.81345 3.31357C9.6891 2.43794 10.7513 2.00012 12 2.00012C13.2487 2.00012 14.3108 2.43794 15.1865 3.31357C16.0621 4.18921 16.5 5.25137 16.5 6.50007V8.50007H17.6922C18.191 8.50007 18.6169 8.67668 18.9701 9.0299C19.3233 9.3831 19.5 9.80906 19.5 10.3078V19.6923C19.5 20.191 19.3233 20.617 18.9701 20.9702C18.6169 21.3234 18.191 21.5 17.6922 21.5H6.3077ZM6.3077 20H17.6922C17.782 20 17.8557 19.9712 17.9134 19.9135C17.9711 19.8558 18 19.7821 18 19.6923V10.3078C18 10.218 17.9711 10.1443 17.9134 10.0866C17.8557 10.0289 17.782 10 17.6922 10H6.3077C6.21795 10 6.14423 10.0289 6.08652 10.0866C6.02882 10.1443 5.99997 10.218 5.99997 10.3078V19.6923C5.99997 19.7821 6.02882 19.8558 6.08652 19.9135C6.14423 19.9712 6.21795 20 6.3077 20ZM12 16.75C12.4859 16.75 12.899 16.5798 13.2394 16.2394C13.5798 15.8991 13.75 15.4859 13.75 15C13.75 14.5141 13.5798 14.101 13.2394 13.7606C12.899 13.4203 12.4859 13.2501 12 13.2501C11.5141 13.2501 11.1009 13.4203 10.7606 13.7606C10.4202 14.101 10.25 14.5141 10.25 15C10.25 15.4859 10.4202 15.8991 10.7606 16.2394C11.1009 16.5798 11.5141 16.75 12 16.75ZM8.99997 8.50007H15V6.50007C15 5.66674 14.7083 4.95841 14.125 4.37507C13.5416 3.79174 12.8333 3.50007 12 3.50007C11.1666 3.50007 10.4583 3.79174 9.87497 4.37507C9.29164 4.95841 8.99997 5.66674 8.99997 6.50007V8.50007Z"
            fill={color}
          />
        </g>
      </svg>
    </SvgIcon>
  );
};

IconLock.propTypes = {
  color: PropTypes.string,
  width: PropTypes.number,
  height: PropTypes.number,
  sx: PropTypes.object,
};

export default IconLock;
