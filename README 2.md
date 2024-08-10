# College Football Realignment Site

Welcome to the College Football Realignment Site! This project features an interactive map and charting interface to visualize and analyze recent and historic realignment in college athletic conferences. The frontend is built with React and integrates various libraries to enhance interactivity and data visualization, delivered through a Django backend.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Libraries Used](#libraries-used)
- [Technologies Used](#technologies-used)
- [Future Enhancements](#future-enhancements)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## Overview

The College Football Realignment Site provides an interactive platform to explore college conference realignments. Users can view geographic distributions, analyze spread metrics, and visualize changes through a dynamic map and charts.

## Features

- **Interactive Map**: Visualize team locations and conference boundaries.
- **Data Visualization**: Chart geographic data.
- **Responsive Design**: Ensure a seamless experience across different devices.
- **Integrated Backend**: Delivered through a Django project for easy deployment.

## Installation

To get started with the College Football Realignment Site, follow these steps:

1. **Clone the repository**:
    ```bash
    git clone https://github.com/EvanJelley/CFB-Realignment-Site.git
    cd CFB-Realignment-Site
    ```

2. **Set up the Django environment**:
    ```bash
    python -m venv env
    source env/bin/activate   # On Windows use `env\Scripts\activate`
    ```

3. **Install the Django dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

4. **Apply migrations**:
    ```bash
    python manage.py migrate
    ```

5. **Set up the React environment**:
    ```bash
    cd frontend
    npm install
    ```

6. **Build the React project**:
    ```bash
    npm run build
    ```

7. **Start the Django development server**:
    ```bash
    cd ..
    python manage.py runserver
    ```

## Usage

Once the development server is running, you can access the site at `http://127.0.0.1:8000/`. The interactive map and charts will be available for you to explore various realignment scenarios.

## Libraries Used

- **React**: A JavaScript library for building user interfaces.
- **React-Leaflet**: Integration with Leaflet for interactive maps.
- **Chart.js**: Simple yet flexible JavaScript charting for designers & developers.
- **Bootstrap**: CSS framework for developing responsive and mobile-first websites.
- **Axios**: Promise-based HTTP client for the browser and Node.js.

## Technologies Used

- **Frontend**: React, React-Leaflet, Chart.js, Bootstrap, Axios
- **Backend**: Django
- **Deployment**: Heroku (for production)

## Future Enhancements

- **Advanced Visualizations**: Incorporate more complex data visualizations.
- **User Interaction**: Add features for user interaction and customization.
- **Real-time Data**: Integrate real-time data updates for the latest information.
- **Enhanced Performance**: Optimize performance for larger datasets.

## Contributing

Contributions are welcome! Please fork the repository and create a pull request with your changes. Ensure your code adheres to the project's coding standards and includes appropriate tests.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contact

For any questions or inquiries, please contact me at [jelleyevan@gmail.com](mailto:jelleyevan@gmail.com).
