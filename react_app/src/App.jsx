import { useEffect, useState, useRef, Fragment } from 'react'
import './App.css'
import axios from 'axios'
import {
  MapContainer,
  TileLayer,
  useMap,
  Marker,
  Popup,
  Polygon,
  Polyline,
  Circle,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css';
import L, { map } from 'leaflet';
import Draggable from 'react-draggable';
import { Line } from 'react-chartjs-2';
import Chart from "chart.js/auto";
import { CategoryScale, plugins } from "chart.js";
import { averageDistanceCalc, pointToPointCalc, calculateConvexHull } from './distances';

Chart.register(CategoryScale);

const vpWidth = window.innerWidth;

const calculateTeamIconSize = () => {
  if (vpWidth < 768) return 10;
  if (vpWidth < 1500) return 14;
  return 20;
};

const calculateConfIconSize = () => {
  if (vpWidth < 768) return 14;
  if (vpWidth < 1500) return 22;
  return 30;
};

const APIURL = 'https://cfb-realignment-api-1eaa1a13606e.herokuapp.com';
const TEAMLOGOSIZE = calculateTeamIconSize();
const CONFLOGOSIZE = calculateConfIconSize();
const AWSBUCKET = 'https://cfb-realignment-frontend.s3.us-east-2.amazonaws.com/';

const footballImage = AWSBUCKET + "static/dist/images/football.png";
const basketballImage = AWSBUCKET + "static/dist/images/basketball.png";
const playImage = AWSBUCKET + "static/dist/images/play.png";
const githubLogo = AWSBUCKET + "static/dist/images/github.png";
const pauseImage = AWSBUCKET + "static/dist/images/pause.png";

const chartOptions = {
  aspectRatio: 1.7,
  plugins: {
    legend: {
      display: false,
    },
  },
  scales: {
    y: {
      title: {
        display: true,
        text: 'Miles',
        color: '#00254c',
        font: {
          size: 16
        }
      }
    },
  },
};

function App() {

  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [conferenceList, setConferenceList] = useState([])
  const [filteredConferenceList, setFilteredConferenceList] = useState([])
  const [summaryStatsConfObject, setSummaryStatsConfObject] = useState({})


  const [conferenceIcons, setConferenceIcons] = useState({})
  const [conferenceLogos, setConferenceLogos] = useState({})
  const [schoolIcons, setSchoolIcons] = useState({})
  const [conferenceColors, setConferenceColors] = useState([])
  const [chartData, setChartData] = useState({})
  const [ballImages, setBallImages] = useState({})

  const [animate, setAnimate] = useState(false)
  const [redrawTimelineBool, setRedrawTimelineBool] = useState(false)
  const animateRef = useRef(animate)
  const [animationSpeed, setAnimationSpeed] = useState(500)
  const [mapDisplay, setMapDisplay] = useState({ teams: true, capitals: true, lines: true, confCountry: true, schoolCircles: false });
  const [confCountryOpacity, setConfCountryOpacity] = useState(0.5)
  const [confCountrySize, setConfCountrySize] = useState(100)


  const [conferenceNames, setConferenceNames] = useState(["SEC", "Big Ten", "ACC", "Big 12", "Pac 12", "Mountain West", "Sun Belt", "CUSA", "MAC", "AAC", "Big East", "NCAA"])
  const [historicalConferenceNames, setHistoricalConferenceNames] = useState(["SWC", "Big Eight", "WAC", "Big West", "Skyline", "Border"])
  const [selectedConferences, setSelectedConferences] = useState([])
  const [conferenceYears, setConferenceYears] = useState([])
  const [selectedYear, setSelectedYear] = useState('')
  const [sport, setSport] = useState('football')
  const [splitConference, setSplitConference] = useState(false)

  { /* API Calls */ }
  const getConferences = async () => {
    try {
      setIsLoading(true)
      const response = await axios.get(APIURL + '/api/conferencebyyear/')
      setConferenceList(response.data)

      let conferenceNameList = conferenceNames
      response.data.map((conference) => {
        conferenceNameList.includes(conference.conference) || historicalConferenceNames.includes(conference.conference) ? null :
          conferenceNameList.push(conference.conference)
      });
      setConferenceNames(conferenceNameList)

      setSelectedConferences([conferenceNameList[0], conferenceNameList[1]])

      setFilteredConferenceList(response.data.filter((conference) => conference.conference == conferenceNameList[0]))

      setSelectedYear(1932)

      const logoResponse = await axios.get(APIURL + '/api/conferencelogos/')
      let logos = {};
      let colors = {};
      logoResponse.data.forEach((logo) => {
        logos[logo.name] = logo.logo;
        colors[logo.name] = logo.colors;
      });
      setConferenceLogos(logos);
      setConferenceColors(colors);
      console.log(colors)

      const confIconsPromises = logoResponse.data.map(async (logo) => {
        const dimensions = await getImageDimmensions(logo.logo, CONFLOGOSIZE);
        return { name: logo.name, icon: L.icon({ iconUrl: logo.logo, iconSize: dimensions }) };
      });
      const confIconsArray = await Promise.all(confIconsPromises);
      let confIcons = {};
      confIconsArray.forEach(item => {
        confIcons[item.name] = item.icon;
      });
      setConferenceIcons(confIcons);

      const responseSchools = await axios.get(APIURL + '/api/schoollogos/')
      const schoolIconsPromises = responseSchools.data.map(async (school) => {
        const dimensions = await getImageDimmensions(school.logo, TEAMLOGOSIZE);
        return { name: school.name, icon: L.icon({ iconUrl: school.logo, iconSize: dimensions }) };
      });
      const schoolIconsArray = await Promise.all(schoolIconsPromises);
      let schoolIcons = {};
      schoolIconsArray.forEach(item => {
        schoolIcons[item.name] = item.icon;
      });
      setSchoolIcons(schoolIcons);

      const loadBallImages = async () => {
        const footballImg = new Image();
        footballImg.src = footballImage;
        footballImg.width = 15;
        footballImg.height = 15;
        await new Promise((resolve, reject) => {
          footballImg.onload = resolve;
          footballImg.onerror = reject;
        });

        const basketballImg = new Image();
        basketballImg.src = basketballImage;
        basketballImg.width = 15;
        basketballImg.height = 15;
        await new Promise((resolve, reject) => {
          basketballImg.onload = resolve;
          basketballImg.onerror = reject;
        });
        setBallImages({ football: footballImg, basketball: basketballImg });
      }
      loadBallImages();

    } catch (error) {
      setHasError(true)
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  { /* Chart Builder */ }
  useEffect(() => {
    const setCharts = async () => {

      let selectedConferenceList = [];
      if (sport === 'football') {
        selectedConferenceList = conferenceList.filter((conference) =>
          selectedConferences.includes(conference.conference) && conference.football);
      } else {
        selectedConferenceList = conferenceList.filter((conference) =>
          selectedConferences.includes(conference.conference) && conference.basketball);
      }


      let conferenceCharts = {};

      selectedConferences.map((conferenceName) => {
        let conference = selectedConferenceList.filter((conference) => conference.conference == conferenceName);
        let confData = {
          labels: conference ? conference.map((conf) => conf.year) : [],
          datasets: [
            {
              label: 'Average Distance Between Schools',
              data: conference ? conference.map((conf) => conf.avgDistanceBetweenSchools) : [],
              pointStyle: conference ? conference.map((conf) =>
                conf.year === selectedYear ? sport === 'football' ? ballImages.football : ballImages.basketball : false) : [],
              borderColor: conferenceColors[conferenceName] ? conferenceColors[conferenceName].main : '#000',
            },
            {
              label: 'Average Distance from Center',
              data: conference ? conference.map((conf) => conf.avgDistanceFromCenter) : [],
              pointStyle: conference ? conference.map((conf) =>
                conf.year === selectedYear ? sport === 'football' ? ballImages.football : ballImages.basketball : false) : [],
              borderColor: conferenceColors[conferenceName] ? conferenceColors[conferenceName].light : '#000',
            },
          ],
        };
        conferenceCharts[conferenceName] = confData;
      });

      let totalYears = [];
      selectedConferenceList.map((conference) => {
        totalYears.includes(conference.year) ? null : totalYears.push(conference.year)
      });
      totalYears.sort();

      let summaryStats = {};
      totalYears.forEach((year) => {
        let currentConfs = selectedConferenceList.filter((conference) => conference.year === year);
        let avgDistance = Number((currentConfs.reduce((a, b) => a + Number(b.avgDistanceBetweenSchools), 0) / currentConfs.length).toFixed(2));
        let avgDistanceFromCenter = Number((currentConfs.reduce((a, b) => a + Number(b.avgDistanceFromCenter), 0) / currentConfs.length).toFixed(2));
        summaryStats[year] = { avgDistance, avgDistanceFromCenter };
      });

      let ncaaData = {
        labels: totalYears ? totalYears : [],
        datasets: [
          {
            label: 'Average Distance Between Schools',
            data: summaryStats ? totalYears.map((year) => summaryStats[year].avgDistance) : [],
            pointStyle: summaryStats ? totalYears.map((year) =>
              year === selectedYear ? sport === 'football' ? ballImages.football : ballImages.basketball : false) : [],
            borderColor: conferenceColors["NCAA"] ? conferenceColors["NCAA"].main : '#000'
          },
          {
            label: 'Average Distance from Center',
            data: summaryStats ? totalYears.map((year) => summaryStats[year].avgDistanceFromCenter) : [],
            pointStyle: summaryStats ? totalYears.map((year) =>
              year === selectedYear ? sport === 'football' ? ballImages.football : ballImages.basketball : false) : [],
            borderColor: conferenceColors["NCAA"] ? conferenceColors["NCAA"].dark : '#000'
          },
        ],
      }

      conferenceCharts['NCAA'] = ncaaData;

      const currentAvgDistanceBetweenNCAA = summaryStats[selectedYear].avgDistance;
      const currentAvgDistanceFromCenterNCAA = summaryStats[selectedYear].avgDistanceFromCenter;

      createSummaryConf(selectedYear, sport, currentAvgDistanceBetweenNCAA, currentAvgDistanceFromCenterNCAA)

      console.log(summaryStatsConfObject)

      setChartData(conferenceCharts);
    };
    setCharts().catch(console.error);
  }, [selectedConferences, sport, selectedYear]);

  const getImageDimmensions = (url, pixels) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        let aspectRatio = width / height;
        aspectRatio > 3 ? pixels *= .7 : null;
        img.width > img.height ? resolve([Math.round(pixels * aspectRatio), pixels]) : resolve([pixels, Math.round(pixels / aspectRatio)]);
      };
      img.onerror = () => {
        reject('error');
      };
    });
  };

  useEffect(() => {
    getConferences()
  }, [])

  const createSummaryConf = (yearVar, sportVar, avgDistanceBetween, avgDistanceFromCenter) => {
    const schoolList = filteredConferenceList.map((conference) => conference.schools).flat();
    let confObject = {
      id: 0,
      year: yearVar,
      conference: "NCAA",
      football: sportVar === 'football' ? true : false,
      basketball: sportVar === 'basketball' ? true : false,
      schools: schoolList,
      avgDistanceBetweenSchools: avgDistanceBetween,
      avgDistanceFromCenter: avgDistanceFromCenter,
    }
    setSummaryStatsConfObject(confObject)
  }

  const sportHandler = (e) => {
    const button = e.target.closest('button');
    const sport = button.textContent.toLowerCase().trim();
    setSport(sport)
  }

  const splitConferenceMonitor = () => {
    let split = false;
    filteredConferenceList.map((conference) => {
      conference.football && conference.basketball ? null : split = true
    });
    setSplitConference(split)
  }

  const selectConferenceHandler = (e) => {
    setAnimate(false)
    const button = e.target.closest('button');
    const conferenceName = button.getAttribute('data-conf-name');
    console.log(conferenceName)
    let newConferenceList = []
    switch (conferenceName) {
      case 'Power 5':
        newConferenceList = ['SEC', 'Big Ten', 'ACC', 'Big 12', 'Pac 12']
        break;
      case "Power 4":
        newConferenceList = ['SEC', 'Big Ten', 'ACC', 'Big 12']
        break;
      case "Group of 5":
        newConferenceList = ['Mountain West', 'Sun Belt', 'CUSA', 'MAC']
        break;
      case "Big 2":
        newConferenceList = ['SEC', 'Big Ten']
        break;
      case "Basketball Conferences":
        newConferenceList = ["Big East", "ACC", "Big Ten", "Big 12"]
        setSport('basketball')
        break;
      case "NCAA":
        newConferenceList = ["SEC", "Big Ten", "ACC", "Big 12", "Pac 12", "Mountain West", "Sun Belt", "CUSA", "MAC", "AAC", "SWC", "Big Eight", "WAC", "Big West", "Skyline", "Border", "Big East"]
        break;
      default:
        conferenceName == "Big East" ? setSport('basketball') : null
        selectedConferences.includes(conferenceName) ? newConferenceList = selectedConferences.filter((conf) => conf !== conferenceName) : newConferenceList = [...selectedConferences, conferenceName]
        newConferenceList.length === 0 ? newConferenceList = [conferenceName] : null
        break;
    }
    setSelectedConferences(newConferenceList)
    setRedrawTimelineBool(true)
  }

  const preprogrammedAnimationsHandler = (e) => {
    const button = e.target.closest('button');
    const animation = button.getAttribute('data-anim-name');
    switch (animation) {
      case 'All of CFB History':
        setSelectedConferences(['SEC', 'Big Ten', 'ACC', 'Big 12', 'Pac 12', 'Mountain West', 'Sun Belt', 'CUSA', 'MAC', 'AAC', "SWC", "Big Eight", "WAC", "Big West", "Skyline", "Border"]);
        yearMapButtonHandler(1896);
        setMapDisplay({ teams: false, capitals: true, lines: true, confCountry: true, schoolCircles: false });
        setConfCountryOpacity(0.9);
        setConfCountrySize(50);
        setAnimationSpeed(500);
        setTimeout(() => {
          setAnimate(true);
        }, 2000);
        break;
      case 'Modern Expansion':
        setSelectedConferences(['SEC', 'Big Ten', 'Big 12', 'Pac 12', 'ACC']);
        yearMapButtonHandler(2001);
        setMapDisplay({ teams: false, capitals: true, lines: true, confCountry: true, schoolCircles: false });
        setConfCountryOpacity(0.5);
        setConfCountrySize(50);
        setAnimationSpeed(500);
        setTimeout(() => {
          setAnimate(true);
        }, 2000);
        break;
      case 'Death of the Pac 12':
        setSelectedConferences(['Pac 12', 'Big Ten', 'Big 12', 'ACC']);
        yearMapButtonHandler(2023);
        setMapDisplay({ teams: false, capitals: true, lines: true, confCountry: true, schoolCircles: false });
        setConfCountryOpacity(0.8);
        setConfCountrySize(100);
        setAnimationSpeed(1000);
        setTimeout(() => {
          setAnimate(true);
        }, 2000);
        break;
      case 'CUSA & The Sun Belt: A Wild Ride':
        setSelectedConferences(['CUSA', 'Sun Belt']);
        yearMapButtonHandler(1989);
        setMapDisplay({ teams: false, capitals: true, lines: true, confCountry: true, schoolCircles: false });
        setConfCountryOpacity(0.8);
        setConfCountrySize(50);
        setAnimationSpeed(300);
        setTimeout(() => {
          setAnimate(true);
        }, 2000);
        break
      case 'Big 2 since 32':
        setSelectedConferences(['SEC', 'Big Ten']);
        yearMapButtonHandler(1932);
        setMapDisplay({ teams: false, capitals: true, lines: true, confCountry: true, schoolCircles: false });
        setConfCountryOpacity(0.8);
        setConfCountrySize(100);
        setAnimationSpeed(100);
        setTimeout(() => {
          setAnimate(true);
        }, 2000);
        break;
      case 'Truly Mid-American':
        setSelectedConferences(['MAC']);
        yearMapButtonHandler(1946);
        setMapDisplay({ teams: true, capitals: false, lines: false, confCountry: true, schoolCircles: false });
        setConfCountryOpacity(0.8);
        setConfCountrySize(150);
        setAnimationSpeed(100);
        setTimeout(() => {
          setAnimate(true);
        }, 2000);
        break;
      case 'What is the Big 12?':
        setSelectedConferences(['Big 12']);
        yearMapButtonHandler(1996);
        setMapDisplay({ teams: true, capitals: true, lines: true, confCountry: true, schoolCircles: false });
        setConfCountryOpacity(0.6);
        setConfCountrySize(150);
        setTimeout(() => {
          yearMapButtonHandler(2024);
        }, 3000);
        break;
      default:
        break;
    }
  }

  const selectYearHandler = (year) => {
    setSelectedYear(year)
  }

  const yearSearch = (e) => {
    let year = e.target.value;
    if (year.length == 4 && !isNaN(year) && year >= conferenceYears[0] && year <= conferenceYears[conferenceYears.length - 1]) {
      setSelectedYear(Number(year))
      setRedrawTimelineBool(true)
    }
  }

  const yearMapButtonHandler = (year) => {
    setSelectedYear(Number(year))
    setRedrawTimelineBool(true)
  }

  const conferenceFilter = () => {
    if (sport == 'football') {
      let filteredList = conferenceList.filter((conference) => {
        return conference.year == selectedYear && selectedConferences.includes(conference.conference) && conference.football
      })
      setFilteredConferenceList(filteredList)
    } else {
      let filteredList = conferenceList.filter((conference) => {
        return conference.year == selectedYear && selectedConferences.includes(conference.conference) && conference.basketball
      })
      setFilteredConferenceList(filteredList)
    };
    splitConferenceMonitor()
  }

  useEffect(() => {
    conferenceFilter()
  }, [selectedYear, sport, selectedConferences])

  useEffect(() => {
    let years = []
    conferenceList.map((conference) => {
      selectedConferences.includes(conference.conference) && !years.includes(conference.year) ? years.push(conference.year) : null
    });
    years.sort()
    setConferenceYears(years)
    console.log(selectedYear)
    years.includes(Number(selectedYear)) ? conferenceFilter() : setSelectedYear(years[0])
  }, [selectedConferences])

  const animationHandler = () => {
    setAnimate(!animate)
  }

  useEffect(() => {
    let interval;
    if (animate) {
      let i = conferenceYears.indexOf(selectedYear) + 1;
      interval = setInterval(() => {
        if (i >= conferenceYears.length) {
          clearInterval(interval);
          setAnimate(false);
        } else {
          setSelectedYear(conferenceYears[i]);
          setRedrawTimelineBool(true);
          i++;
        }
      }, animationSpeed);
    }
    return () => clearInterval(interval);
  }, [animate, animationSpeed]);

  const autoScrollSpeedHandler = (value) => {
    const newSpeed = value === 'increase' ? Math.min(animationSpeed + 100, 1500) : Math.max(animationSpeed - 100, 100);
    setAnimationSpeed(newSpeed);
  }

  const handleMapDisplay = (value) => {
    switch (value) {
      case 'capitals':
        setMapDisplay({ teams: mapDisplay.teams, capitals: !mapDisplay.capitals, lines: mapDisplay.lines, confCountry: mapDisplay.confCountry });
        break;
      case 'teams':
        setMapDisplay({ teams: !mapDisplay.teams, capitals: mapDisplay.capitals, lines: mapDisplay.lines, confCountry: mapDisplay.confCountry });
        break;
      case 'lines':
        setMapDisplay({ teams: mapDisplay.teams, capitals: mapDisplay.capitals, lines: !mapDisplay.lines, confCountry: mapDisplay.confCountry });
        break;
      case 'confCountry':
        setMapDisplay({ teams: mapDisplay.teams, capitals: mapDisplay.capitals, lines: mapDisplay.lines, confCountry: !mapDisplay.confCountry });
        break;
      case 'schoolCircles':
        setMapDisplay({ teams: mapDisplay.teams, capitals: mapDisplay.capitals, lines: mapDisplay.lines, confCountry: mapDisplay.confCountry, schoolCircles: !mapDisplay.schoolCircles });
      default:
        break;
    }
  };

  const handleConfCountryOpacity = (value) => {
    if (value === 'increase') {
      setConfCountryOpacity(parseFloat((Math.min(confCountryOpacity + 0.1, 1)).toFixed(1)));
    } else {
      setConfCountryOpacity(parseFloat((Math.max(confCountryOpacity - 0.1, 0.1)).toFixed(1)));
    }
  }

  const handleConfCountrySize = (value) => {
    if (value === 'increase') {
      setConfCountrySize(Math.min((confCountrySize + 10), 300));
    } else {
      setConfCountrySize(Math.max((confCountrySize - 10), 50));
    }
  }

  var myIcon = L.icon({
    iconUrl: APIURL + '/media/images/conf_logos/ncaa.png',
    iconSize: [10, 10],
  });

  return (
    <>
      {isLoading ?
        <div>
          <img src={AWSBUCKET + "static/dist/images/football_backdrop.jpg"} className='backdrop' />
          <p className='loading' style={{ color: "white" }}>Loading...</p>
        </div>
        :
        <>
          <img src={sport == 'football' ? AWSBUCKET + 'static/dist/images/football_backdrop.jpg' : AWSBUCKET + 'static/dist/images/basketball_backdrop.webp'} className='backdrop' />
          <div className='main-app-container'>
            <NavBar conferenceNames={conferenceNames}
              historicalConferenceNames={historicalConferenceNames}
              conferenceYears={conferenceYears}
              selectConference={selectConferenceHandler}
              searchYears={yearSearch}
              conferenceLogosObject={conferenceLogos}
              selectedYear={selectedYear}
              sportHandler={sportHandler}
              splitConference={splitConference}
              selectedConferences={selectedConferences}
              sport={sport}
              preprogrammedAnimations={preprogrammedAnimationsHandler} />
            <div className='row map-chart-row'>
              <div className='col-12 col-md-7'>
                <div className="map-container">
                  <Map filteredConferenceList={filteredConferenceList}
                    conferenceIcons={conferenceIcons}
                    schoolIcons={schoolIcons}
                    selectedConferences={selectedConferences}
                    mapElements={mapDisplay}
                    confColors={conferenceColors}
                    countryOpacity={confCountryOpacity}
                    confCountrySize={confCountrySize} />
                  <DraggableTimeline
                    years={conferenceYears}
                    setYear={selectYearHandler}
                    selectedYear={selectedYear}
                    redraw={redrawTimelineBool}
                    setRedraw={setRedrawTimelineBool}
                    setAnimate={setAnimate} />
                  <MapControls
                    setAnimation={animationHandler}
                    animate={animate} firstYear={conferenceYears[0]}
                    lastYear={conferenceYears[conferenceYears.length - 1]}
                    setYear={yearMapButtonHandler}
                    selectedConferences={selectedConferences}
                    setAutoScrollSpeed={autoScrollSpeedHandler}
                    setMapDisplayOptions={handleMapDisplay}
                    animationSpeed={animationSpeed}
                    mapDisplayOptions={mapDisplay}
                    confCountryOpacity={confCountryOpacity}
                    setConfCountryOpacity={handleConfCountryOpacity}
                    confCountrySize={confCountrySize}
                    setConfCountrySize={handleConfCountrySize} />
                </div>
                <div className='school-list-container'>
                  <TeamList filteredConferenceList={filteredConferenceList} conferenceLogosObject={conferenceLogos} schoolIcons={schoolIcons} />
                </div>
              </div>
              <div className='col-12 col-md-5'>
                <DetailsSidebar
                  filteredConferenceList={filteredConferenceList}
                  conferenceLogos={conferenceLogos}
                  conferenceColors={conferenceColors}
                  selectedConferences={selectedConferences}
                  selectedYear={selectedYear}
                  yearMapButtonHandler={yearMapButtonHandler}
                  chartData={chartData}
                  ncaaConfObject={summaryStatsConfObject} />
              </div>
            </div>
          </div>
        </>
      }
    </>
  )
}

function DetailsSidebar({ filteredConferenceList, conferenceLogos, conferenceColors, selectedConferences, selectedYear, yearMapButtonHandler, chartData, ncaaConfObject }) {
  const [orderedConferences, setOrderedConferences] = useState([])

  console.log(filteredConferenceList.length)

  useEffect(() => {
    let currentConferences = filteredConferenceList.map((conference) => conference.conference);
    let outOfRange = [];
    let current = [];
    selectedConferences.forEach((conference) => {
      currentConferences.includes(conference) ? current.push(conference) : outOfRange.push(conference);
    });
    setOrderedConferences([...current, ...outOfRange]);
  }, [filteredConferenceList, selectedConferences]);

  return (
    <div className='chart-details-container'>
      {orderedConferences.map((conference) => {
        if (!chartData[conference]) {
          return <p key={conference}>Loading...</p>;
        }
        let startYear = Number(chartData[conference].labels[0]);
        let endYear = Number(chartData[conference].labels[chartData[conference].labels.length - 1]);

        return chartData[conference] && startYear <= selectedYear && endYear >= selectedYear ? (
          <div className='ind-conf-detail-container' style={{ backgroundColor: `${conferenceColors[conference].light}10`, }}>
            <ConferenceDetails
              conference={filteredConferenceList.filter((conferenceObject) => conferenceObject.conference === conference)[0]}
              confLogos={conferenceLogos}
              confColors={conferenceColors}
              selectedConference={conference} />
            <div className='chart-container'>
              <Line data={chartData[conference]} options={chartOptions} />
            </div>
          </div>
        ) : (
          <div className='ind-conf-detail-container' style={{ backgroundColor: `${conferenceColors[conference].light}10`, }}>
            <ConferenceDetails
              conference={filteredConferenceList.filter((conferenceObject) => conferenceObject.conference === conference)[0]}
              confLogos={conferenceLogos}
              confColors={conferenceColors}
              selectedConference={conference}
              selectedYear={selectedYear}
              startYear={startYear}
              endYear={endYear}
              setYear={yearMapButtonHandler} />
          </div>
        );
      })}
      <div className='ind-conf-detail-container' style={{ backgroundColor: `${conferenceColors["NCAA"].light}10`, }}>
        <ConferenceDetails
          conference={ncaaConfObject}
          confLogos={conferenceLogos}
          confColors={conferenceColors}
          selectedConference={"NCAA"}
          selectedYear={selectedYear}
          numberOfConf={filteredConferenceList.length}
        />
        <div className='chart-container'>
          <Line data={chartData["NCAA"]} options={chartOptions} />
        </div>
      </div>
    </div>
  )
}


function TeamList({ filteredConferenceList, conferenceLogosObject, schoolIcons }) {
  const [allTeams, setAllTeams] = useState([]);
  const [selectedTeams, setSelectedTeams] = useState([]);

  const selectTeamHandler = (e) => {
    const button = e.target.closest('button');
    const teamName = button.getAttribute('data-team-name');
    selectedTeams.includes(teamName) ? setSelectedTeams(selectedTeams.filter((team) => team !== teamName)) : setSelectedTeams([...selectedTeams, teamName])
  }

  useEffect(() => {
    let teams = [];
    filteredConferenceList.map((conference) => {
      conference.schools.map((school) => {
        teams.push(school.name)
      })
    });
    setAllTeams(teams);
  }, [filteredConferenceList])

  useEffect(() => {
    selectedTeams.filter((team) => !allTeams.includes(team)).length > 0 ? setSelectedTeams(selectedTeams.filter((team) => allTeams.includes(team))) : null
  }, [allTeams])

  return (
    <div className='team-list'>
      {filteredConferenceList.map((conference) => (
        <div className='team-list-conf'>
          <img
            src={conferenceLogosObject[conference.conference]}
            alt={conference.conference}
            className='team-list-conflogo'
            style={{
              height: conference.schools.length <= 6 ? "7rem" : null,
              width: conference.schools.length <= 6 ? "auto" : null
            }} />
          <div className='team-list-schools'>
            <table className='team-list-table'>
              <thead>
                <tr>
                  <th>{conference.conference}</th>
                </tr>
              </thead>
              <tbody>
                {conference.schools.map((school) => (
                  <>
                    {selectedTeams.includes(school.name) ? <SchoolDetails school={school} schoolIcons={schoolIcons} conferenceEra={conference} selectTeamHandler={selectTeamHandler} />
                      :
                      <button onClick={selectTeamHandler} data-team-name={school.name} className='team-list-table-row-button'>
                        <tr key={school.id} className='team-list-table-row'>
                          <td><img src={schoolIcons[school.name].options.iconUrl} alt={school.name} className='team-list-schoollogo' /></td>
                          <td>{school.name}</td>
                          <td>{school.city}, {school.state}</td>
                        </tr>
                      </button>}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

function SchoolDetails({ school, schoolIcons, conferenceEra, selectTeamHandler }) {
  let otherSchools = conferenceEra.schools.filter((schoolObject) => schoolObject.name !== school.name);
  let otherSchoolCoord = otherSchools.map((schoolObject) => [schoolObject.latitude, schoolObject.longitude]);
  console.log(otherSchoolCoord.length);
  let schoolCoord = [school.latitude, school.longitude];
  let capitalCoord = [conferenceEra.capital.latitude, conferenceEra.capital.longitude];
  console.log(capitalCoord);
  let avgDistance = averageDistanceCalc(schoolCoord, otherSchoolCoord, "degrees");
  let distanceToCapital = pointToPointCalc(schoolCoord[0], schoolCoord[1], capitalCoord[0], capitalCoord[1], "degrees");

  return (
    <div className='school-details'>
      <button onClick={selectTeamHandler} data-team-name={school.name} className='team-list-table-row-button'>
        <h3>
          <img src={schoolIcons[school.name].options.iconUrl} alt={school.name} className='school-details-schoollogo' />
          {school.name}
        </h3>
      </button>
      <table className='conference-details-table'>
        <tbody>
          <tr>
            <td className='conference-details-category'>Location</td>
            <td className='conference-details-item'>{school.city}, {school.state}</td>
          </tr>
          <tr>
            <td className='conference-details-category'>Avg Distance to Other Schools</td>
            <td className='conference-details-item'>{avgDistance.toFixed()} mi</td>
          </tr>
          <tr>
            <td className='conference-details-category'>Distance From Capital</td>
            <td className='conference-details-item'>{distanceToCapital.toFixed()} mi</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function ChartControls({ setAnimation, animate, firstYear, lastYear, setYear }) {
  return (
    <nav className="navbar chart-controls" >
      <div className="container-fluid ">
        <div className="nav-item button-container">
          <button onClick={() => setYear(firstYear)} className='first-year-button'>
            {firstYear}
          </button>
          <button onClick={() => setYear(lastYear)} className='present-button'>
            {lastYear}
          </button>
        </div>
        <AutoScrollButton setAnimation={setAnimation} animate={animate} />
        <div className='nav-item map-controls-button secondary-button'>
          <button>...</button>
        </div>
      </div>
    </nav>
  )
};

function MapControls({ setAnimation, animate, firstYear, lastYear, setYear, selectedConferences, setAutoScrollSpeed, setMapDisplayOptions, mapDisplayOptions, animationSpeed, confCountryOpacity, setConfCountryOpacity, confCountrySize, setConfCountrySize }) {
  return (
    <nav className="navbar map-controls">
      <div className="container-fluid">
        <li className="nav-item button-container">
          <button onClick={() => setYear(firstYear)} className='first-year-button'>
            {firstYear}
          </button>
          <button onClick={() => setYear(lastYear)} className='present-button'>
            {lastYear}
          </button>
        </li>
        <AutoScrollButton setAnimation={setAnimation} animate={animate} />
        <li className="nav-item dropdown more-circle">
          <a className="nav-link more-button more-button-container" href="#" id="navbarDropdown" role="button"
            data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">...</a>
          <ul className="dropdown-menu dropdown-menu-up more-map-menu" aria-labelledby="navbarDropdown">

            <h3 className='map-controls-header'>Map Controls</h3>

            <button className='btn btn-secondary map-more-control' onClick={(e) => { e.stopPropagation(); setMapDisplayOptions("confCountry"); }}>
              Show "{selectedConferences.length > 1 ? "Conference Countries" : `${selectedConferences[0]} Country`}" {mapDisplayOptions.confCountry ? <span className='option-check'>&#10003;</span> : null}
            </button>

            <button value="schoolCircles" className='btn btn-secondary map-more-control' onClick={(e) => { e.stopPropagation(); setMapDisplayOptions("schoolCircles"); }}>
              Show School Circles {mapDisplayOptions.schoolCircles ? <span className='option-check'>&#10003;</span> : null}
            </button>

            <button value="both" className='btn btn-secondary map-more-control' onClick={(e) => { e.stopPropagation(); setMapDisplayOptions("lines"); }}>
              Show Lines to Capital {mapDisplayOptions.lines ? <span className='option-check'>&#10003;</span> : null}
            </button>

            <button value="capitalsonly" className='btn btn-secondary map-more-control' onClick={(e) => { e.stopPropagation(); setMapDisplayOptions("capitals"); }}>
              Show Capitals {mapDisplayOptions.capitals ? <span className='option-check'>&#10003;</span> : null}
            </button>

            <button value="teamsonly" className='btn btn-secondary map-more-control' onClick={(e) => { e.stopPropagation(); setMapDisplayOptions("teams"); }}>
              Show Teams {mapDisplayOptions.teams ? <span className='option-check'>&#10003;</span> : null}
            </button>

            <div className='map-more-control'>
              <p>Opacity</p>
              <div className='map-control-plusminus-container'>
                <button className='plusminus-btn' onClick={(e) => { e.stopPropagation(); setConfCountryOpacity("increase"); }}>+</button>
                <button className='plusminus-btn' onClick={(e) => { e.stopPropagation(); setConfCountryOpacity("decrease"); }}>-</button>
                <div className='plusminus-display'>{`${confCountryOpacity}`}</div>
              </div>
            </div>

            <div className='map-more-control'>
              <p>Circle Size</p>
              <div className='map-control-plusminus-container'>
                <button className='plusminus-btn' onClick={(e) => { e.stopPropagation(); setConfCountrySize("increase"); }}>+</button>
                <button className='plusminus-btn' onClick={(e) => { e.stopPropagation(); setConfCountrySize("decrease"); }}>-</button>
                <div className='plusminus-display'>{`${confCountrySize} mi`}</div>
              </div>
            </div>

            <div className='map-more-control'>
              <p>AutoScroll Speed</p>
              <div className='map-control-plusminus-container'>
                <button className='plusminus-btn' onClick={(e) => { e.stopPropagation(); setAutoScrollSpeed("increase"); }}>+</button>
                <button className='plusminus-btn' onClick={(e) => { e.stopPropagation(); setAutoScrollSpeed("decrease"); }}>-</button>
                <div className='plusminus-display'>{`${animationSpeed / 1000} s`}</div>
              </div>
            </div>

          </ul>
        </li>

      </div>
    </nav>
  )
}

function AutoScrollButton({ setAnimation, animate }) {
  return (
    <button onClick={setAnimation} className='nav-item autoscroll-button'>
      <p>Autoscroll </p>
      {animate ? <img src={pauseImage} /> : <img src={playImage} />}
    </button>
  )
}

function NavBar({ conferenceNames, historicalConferenceNames, selectConference, searchYears, conferenceLogosObject, sportHandler, selectedConferences, sport, preprogrammedAnimations }) {
  return (
    <>
      <nav className="navbar navbar-main navbar-expand-lg" >
        <div className="container-fluid">
          <a className="navbar-brand" href="#"> CFB Realignment Map</a >
          <button className="navbar-toggler" type="button" data-toggle="collapse" data-target="#navbarSupportedContent"
            aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
            <img src={AWSBUCKET + "images/menu.png"} alt="hamburger" className='navbar-toggler-img' />
          </button >
          <div className="collapse navbar-collapse" id="navbarSupportedContent" >
            <ul className="navbar-nav me-auto mb-2 mb-lg-0">
              <li className="nav-item">
                <a className="nav-link" href="#">About</a>
              </li>
              <li className="nav-item dropdown">
                <a className="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button"
                  data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                  Conferences
                </a>
                <div className="dropdown-menu" aria-labelledby="navbarDropdown">
                  <h6 className="dropdown-header">Modern</h6>
                  <div className="conf-select-container">
                    <ul className="list-inline dropdown-menu-conferences">
                      {conferenceNames.map((conferenceName) => (
                        conferenceName !== 'NCAA' &&
                        <li key={conferenceName} className='list-inline-item'>
                          <button
                            style={{ height: "3.9rem", backgroundColor: selectedConferences.includes(conferenceName) ? "#f1f1f1" : 'white' }}
                            onClick={(e) => { e.stopPropagation(); selectConference(e) }}
                            data-conf-name={conferenceName}
                            className='dropdown-item'>
                            <img src={conferenceLogosObject[conferenceName]} alt={conferenceName}
                              className='conference-selection-img' />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <h6 className="dropdown-header">Historic</h6>
                  <div className="conf-select-container">
                    <ul className="list-inline dropdown-menu-conferences">
                      {historicalConferenceNames.map((conferenceName) => (
                        <li key={conferenceName} className='list-inline-item'>
                          <button
                            style={{ height: "3.9rem", backgroundColor: selectedConferences.includes(conferenceName) ? "#f1f1f1" : 'white' }}
                            onClick={(e) => { e.stopPropagation(); selectConference(e) }}
                            data-conf-name={conferenceName}
                            className='dropdown-item'>
                            <img src={conferenceLogosObject[conferenceName]} alt={conferenceName}
                              className='conference-selection-img' />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <h6 className="dropdown-header">Select All</h6>
                  <div className="conf-select-container">
                    <ul className="list-inline dropdown-menu-conferences">
                      <li key={'NCAA'} className='list-inline-item'>
                        <button
                          style={{ height: "3.9rem", backgroundColor: selectedConferences.includes('NCAA') ? "#f1f1f1" : 'white' }}
                          onClick={(e) => { e.stopPropagation(); selectConference(e) }}
                          data-conf-name='NCAA'
                          className='dropdown-item'>
                          <img src={conferenceLogosObject['NCAA']} alt='NCAA'
                            className='conference-selection-img' />
                        </button>
                      </li>
                    </ul>
                  </div>
                </div>
              </li>
              <li className="nav-item dropdown">
                <a className="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button"
                  data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                  Sports
                </a>
                <ul className="dropdown-menu" aria-labelledby="navbarDropdown">
                  <li key={'football'} className='dropdown-item'>
                    <button onClick={sportHandler} className='dropdown-item'>
                      <img src={footballImage} alt='football' className='sport-selection-img' /> Football
                      {sport == "football" ? <span className='option-check'>&#10003;</span> : null}
                    </button>
                  </li>
                  <li key={'basketball'} className='dropdown-item'>
                    <button onClick={sportHandler} className='dropdown-item'>
                      <img src={basketballImage} alt='basketball' className='sport-selection-img' /> Basketball
                      {sport == "basketball" ? <span className='option-check'>&#10003;</span> : null}
                    </button>
                  </li>
                </ul>
              </li>
              <li className="nav-item dropdown">
                <a className="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button"
                  data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                  QuickSelect
                </a>
                <ul className="dropdown-menu quickselect-dropdown" aria-labelledby="navbarDropdown">
                  <li><h6 className="dropdown-header">Conferences</h6></li>
                  <li key={'Power5'} className='dropdown-item'>
                    <button onClick={selectConference} className='dropdown-item' data-conf-name="Power 5">
                      Power 5
                    </button>
                  </li>
                  <li key={'Power4'} className='dropdown-item'>
                    <button onClick={selectConference} className='dropdown-item' data-conf-name="Power 4">
                      Power 4
                    </button>
                  </li>
                  <li key={'Group5'} className='dropdown-item'>
                    <button onClick={selectConference} className='dropdown-item' data-conf-name="Group of 5">
                      Group of 5
                    </button>
                  </li>
                  <li key={'Big2'} className='dropdown-item'>
                    <button onClick={selectConference} className='dropdown-item' data-conf-name="Big 2">
                      Big 2
                    </button>
                  </li>
                  <li key={'Basketball'} className='dropdown-item'>
                    <button onClick={selectConference} className='dropdown-item' data-conf-name="Basketball Conferences">
                      Basketball Conferences
                    </button>
                  </li>
                  <li key={'NCAA'} className='dropdown-item'>
                    <button onClick={selectConference} className='dropdown-item' data-conf-name="NCAA">
                      NCAA
                    </button>
                  </li>
                  <li><div className="dropdown-divider"></div></li>
                  <li><h6 className="dropdown-header">Animations</h6></li>
                  <li key={'AllCFB'} className='dropdown-item'>
                    <button onClick={preprogrammedAnimations} className='dropdown-item' data-anim-name="All of CFB History">
                      All of CFB History
                    </button>
                  </li>
                  <li key={'ModernExpansion'} className='dropdown-item'>
                    <button onClick={preprogrammedAnimations} className='dropdown-item' data-anim-name="Modern Expansion">
                      Modern Expansion
                    </button>
                  </li>
                  <li key={'DeathPac12'} className='dropdown-item'>
                    <button onClick={preprogrammedAnimations} className='dropdown-item' data-anim-name="Death of the Pac 12">
                      Death of the Pac 12
                    </button>
                  </li>
                  <li key={'CUSA'} className='dropdown-item'>
                    <button onClick={preprogrammedAnimations} className='dropdown-item' data-anim-name="CUSA & The Sun Belt: A Wild Ride">
                      CUSA & The Sun Belt: A Wild Ride
                    </button>
                  </li>
                  <li key={'Big2'} className='dropdown-item'>
                    <button onClick={preprogrammedAnimations} className='dropdown-item' data-anim-name="Big 2 since 32">
                      Big 2 since '32
                    </button>
                  </li>
                  <li key={'MAC'} className='dropdown-item'>
                    <button onClick={preprogrammedAnimations} className='dropdown-item' data-anim-name="Truly Mid-American">
                      Truly Mid-American
                    </button>
                  </li>
                  <li key={'Big12'} className='dropdown-item'>
                    <button onClick={preprogrammedAnimations} className='dropdown-item' data-anim-name="What is the Big 12?">
                      What is the Big 12?
                    </button>
                  </li>
                </ul>
              </li>
            </ul>
          </div>

          <ul className="navbar-nav d-flex flex-row me-1">
            <li className="nav-item me-3 me-lg-0">
              <a className="nav-link" href="https://github.com/EvanJelley/CFBRealignmentVisualizer" target="_blank" rel="noopener noreferrer">
                <img src={githubLogo} alt='GitHub' className='navbar-logo' />
              </a>
            </li>
          </ul>

          <form className="w-auto" onChange={searchYears} onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
            }
          }}>
            <input type="search" className="form-control searchbar" placeholder="Type a Year" aria-label="Search" maxLength="4" />
          </form>
        </div >
      </nav >
    </>
  )
}

const DraggableTimeline = ({ years, setYear, selectedYear, redraw, setRedraw, setAnimate }) => {

  let yearRange = Math.abs(years[0] - years[years.length - 1]);

  const nodeRef = useRef(null);
  const [position, setPosition] = useState({ x: 0, y: 0, percentPosition: 0 });
  const lineDotRef = useRef(null);
  const [prevYear, setPrevYear] = useState(selectedYear);
  const [draggableKey, setDraggableKey] = useState(0);
  const [bounds, setBounds] = useState({ left: -100, right: 100, top: 0, bottom: 0 });
  const yearWidth = 50;


  const updateBounds = () => {
    if (!lineDotRef.current) return console.log('No ref');
    let totalYearsWidth = yearWidth * yearRange;
    let leftBound = -(totalYearsWidth + yearWidth);
    setBounds({ left: leftBound, right: 1, top: 0, bottom: 0 });
  };

  useEffect(() => {
    updateBounds();
    const newX = -(selectedYear - years[0]) * yearWidth - yearWidth / 2;
    setPosition({ x: newX, y: 0, percentPosition: newX / bounds.left });
    setPrevYear(selectedYear);
  }, [yearRange]);

  useEffect(() => {
    if (redraw) {
      setDraggableKey(draggableKey + 1);
      setPrevYear(selectedYear);
      setYear(selectedYear);
      setPosition({ x: -(selectedYear - years[0]) * yearWidth - yearWidth / 2, y: 0, percentPosition: -(selectedYear - years[0]) / yearRange });
      setRedraw(false);
    }
  }, [redraw]);

  useEffect(() => {

    updateBounds();

    const resizeObserver = new ResizeObserver(() => {
      updateBounds();
    });

    if (lineDotRef.current) {
      resizeObserver.observe(lineDotRef.current);
    }

    return () => {
      if (lineDotRef.current) {
        resizeObserver.unobserve(lineDotRef.current);
      }
      resizeObserver.disconnect();
    };
  }, [lineDotRef.current, redraw]);

  const handleDrag = (e, data) => {
    setAnimate(false);
    const newPostion = { x: data.x, y: 0, percentPosition: data.x / bounds.left }
    setPosition(newPostion);
    const index = Math.floor((data.x / bounds.left) * (years.length));
    const safeIndex = index < 0 ? 0 : index >= years.length ? years.length - 1 : index;
    setYear(years[safeIndex]);
  };

  return (
    <>
      <div className='line-dot'
        ref={lineDotRef}
        style={{
          width: "100%",
          height: '30px',
          overflow: 'hidden',
          position: 'relative',
        }}>
        <Draggable axis="x" bounds={bounds} onDrag={handleDrag} position={position} nodeRef={nodeRef} key={draggableKey}>
          <div style={{ display: 'inline-block', overflow: 'hidden', whiteSpace: "nowrap", position: "absolute", left: "50%" }} ref={nodeRef}>
            {
              years.map((year, index) => (
                <div
                  key={year}
                  style={{
                    width: `${yearWidth}px`,
                    height: '30px',
                    background: selectedYear == year ? '#00254c' : 'white',
                    color: selectedYear == year ? 'white' : '#00254c',
                    border: '1px solid #ccc',
                  }}
                  className='timeline-year'
                >
                  {year}
                </div>
              ))}
          </div>
        </Draggable >
      </div >
      <div className="yearSelectorTriangle">
        <div
          className="triangle"
        ></div>
      </div>
    </>
  );
};

function Map({ filteredConferenceList, conferenceIcons, schoolIcons, selectedConferences, mapElements, confColors, countryOpacity, confCountrySize }) {

  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const [width, setwidth] = useState(window.innerWidth);
  const [schoolCoordinates, setSchoolCoordinates] = useState({});
  const [confCountryCoords, setConfCountryCoords] = useState({});
  const [schoolToCenterLines, setSchoolToCenterLines] = useState({})

  const CircleRadius = confCountrySize * 1609

  useEffect(() => {
    let newCoordObject = {};
    let conferenceCountryCoords = {};
    let newLineObject = {};
    filteredConferenceList.map((conference) => {
      let coords = [];
      let linesToCenter = [];
      conference.schools.map((school) => {
        coords.push([Number(school.latitude), Number(school.longitude)]);
        let lineToCenter = []
        lineToCenter.push([Number(school.latitude), Number(school.longitude)]);
        lineToCenter.push([Number(conference.capital.latitude), Number(conference.capital.longitude)]);
        linesToCenter.push(lineToCenter)
      });
      conferenceCountryCoords[conference.conference] = calculateConvexHull(coords);
      newCoordObject[conference.conference] = coords;
      newLineObject[conference.conference] = linesToCenter;
    });
    setConfCountryCoords(conferenceCountryCoords);
    setSchoolCoordinates(newCoordObject);
    setSchoolToCenterLines(newLineObject);
  }, [filteredConferenceList]);

  const calculateHeight = () => {
    if (width < 480) return 33;
    if (width < 1500) return 50;
    return 75;
  };

  const [mapHeight, setMapHeight] = useState(calculateHeight());


  const handleResize = () => {
    if (mapRef.current) {
      setwidth(window.innerWidth);
      const { current: map } = mapRef;
      map.fitBounds(USbounds);
      map.zoomControl.setPosition('topright');
    }
  };

  useEffect(() => {
    setMapHeight(calculateHeight());
  }, [width]);

  useEffect(() => {
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    handleResize();

    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current);
      }
    };
  }, []);

  const USbounds = [
    [49.3457868, -66.93457],
    [24.396308, -125.0859375]
  ];

  const greaterUsBounds = [
    [51, -64],
    [22, -127]
  ];

  const mapStyles = {};
  Object.keys(confColors).forEach((conference) => {
    if (conference !== 'NCAA') {
      try {
        mapStyles[conference] = {
          lineOptions: { color: confColors[conference].main, weight: "1", fill: true },
          circleOptions: { color: confColors[conference].light },
        };
      } catch (error) {
        console.log(error);
      }
    }
  });

  const standardLineOptions = { color: '#00254c', weight: "1", fill: true, };
  const standardCircleOptions = { color: '#00254c', fillOpacity: 0.1 };

  return (
    <div ref={containerRef}>
      <MapContainer
        key={mapHeight}
        maxBounds={USbounds}
        maxBoundsViscosity={1.0}
        ref={mapRef}
        style={{ height: `${mapHeight}vh`, width: '100%' }}
        zoomSnap={.25}
        zoomDelta={.5}
        minZoom={2}
        maxZoom={5}
        whenCreated={(mapInstance) => { mapRef.current = mapInstance; handleResize(); }}
      >
        <TileLayer
          attribution='&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url='https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png'
        />
        {filteredConferenceList.map((conference) => conference.schools.map((school) => (
          <Fragment key={`${school.name}-${school.id}`}>
            {mapElements.teams ?
              <Marker position={[Number(school.latitude), Number(school.longitude)]}
                icon={schoolIcons[school.name] || myIcon} zIndexOffset={1000}>
                <Popup>
                  {school.name} - {school.city}, {school.state}
                </Popup>
              </Marker>
              : null
            }
            {mapElements.schoolCircles ?
              <Circle
                center={[Number(school.latitude), Number(school.longitude)]}
                pathOptions={{ ...mapStyles[conference.conference].circleOptions, fillOpacity: countryOpacity } || standardCircleOptions}
                radius={CircleRadius}
                stroke={false}
              />
              : null
            }
          </Fragment>
        ))
        )
        }
        {mapElements.capitals && filteredConferenceList.map((conference) => (
          <Marker key={`${conference.capital.name}-${conference.id}`}
            position={[Number(conference.capital.latitude), Number(conference.capital.longitude)]}
            icon={conferenceIcons[conference.conference]} zIndexOffset={500}>
            <Popup>
              Proposed {conference.conference} Capital: {conference.capital.name} - {conference.capital.state}
            </Popup>
          </Marker>
        ))}
        {filteredConferenceList.map((conference) => (conference.schools.map((school) => (
          school.name.includes('Hawai') ?
            <HawaiiMapOverlay school={school} schoolIcons={schoolIcons} conference={conference} lineOptions={mapStyles[conference.conference].lineOptions} circleOptions={mapStyles[conference.conference].circleOptions} mapElements={mapElements} />
            : null)
        )))}

        {mapElements.lines && selectedConferences.map((conference) => (
          schoolToCenterLines[conference] && <Polyline pathOptions={mapStyles[conference].lineOptions || standardLineOptions} positions={schoolToCenterLines[conference]} />))}

        {mapElements.confCountry && selectedConferences.map((conference) => (
          confCountryCoords[conference] && <Polygon pathOptions={{ ...mapStyles[conference].lineOptions, fillOpacity: countryOpacity || standardLineOptions }} positions={confCountryCoords[conference]} />))}
      </MapContainer>
    </div>
  )
};

const HawaiiMapOverlay = ({ school, schoolIcons, conference, lineOptions, circleOptions, mapElements }) => {
  const hawaiiCenter = [20.7984, -157];

  const lineToCenter = [hawaiiCenter, [Number(conference.capital.latitude), Number(conference.capital.longitude)]]

  const calculateHeight = () => {
    if (vpWidth < 768) return 12;
    if (vpWidth < 1500) return 12;
    return 37;
  };

  const calculateWidth = () => {
    if (vpWidth < 768) return 12;
    if (vpWidth < 1500) return 12;
    return 37;
  }

  const calculateZoomLevel = () => {
    if (vpWidth < 768) return 4;
    if (vpWidth < 1500) return 4;
    return 6;
  };

  let overlayBoolean = mapElements.teams || mapElements.lines || mapElements.confCountry;

  return (
    <>
      {overlayBoolean &&
        <MapContainer
          className='hawaii-map-overlay'
          center={hawaiiCenter}
          zoom={calculateZoomLevel()}
          style={{ height: `${calculateHeight()}vh`, width: `${calculateWidth()}vw`, position: 'absolute', bottom: '10px', left: '10px', zIndex: 1000 }}
          scrollWheelZoom={false}
          dragging={false}
          zoomControl={false}
          doubleClickZoom={false}
        >
          <TileLayer
            url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' id='HawaiiAttribution'
          />
          {mapElements.teams && <Marker key={school.id} position={[Number(school.latitude), Number(school.longitude)]} icon={schoolIcons[school.name]} />}
          {mapElements.confCountry && <Circle center={[Number(school.latitude), Number(school.longitude)]} pathOptions={circleOptions} radius={200 * 1609} stroke={false} />}
          {mapElements.lines && <Polyline pathOptions={lineOptions} positions={lineToCenter} />}
        </MapContainer>}
    </>
  );
};

function ConferenceDetails({ conference, confLogos, confColors, selectedConference, selectedYear, startYear, endYear, setYear, numberOfConf }) {

  return (conference ?
    <div className='conference-details'>
      <div className='conference-details-main'>
        <h3 className='conference-details-conference'>
          <span className='conference-details-category-header'>{conference.conference == "NCAA" ? "Summary Stats:" : "Conference:"}</span>
          <img className='conference-details-conference-img' src={confLogos[conference.conference]} />
        </h3>
        <h3 className='conference-details-year'>
          <span className='conference-details-category-header'>
            Year:
          </span>
          <span className='conference-details-category-header-year'>
            {conference.year}
          </span>
        </h3>
      </div>
      <div className='conference-details-specific'>
        <table className='conference-details-table'>
          <tbody>
            {conference.conference !== "NCAA" ?
              <tr>
                <td className='conference-details-category'>Proposed Capital</td>
                <td className='conference-details-item'>{conference.capital.name}, {conference.capital.state}</td>
              </tr>
              :
              <tr>
                <td className='conference-details-category'>Number of Conferences</td>
                <td className='conference-details-item'>{numberOfConf}</td>
              </tr>}
            <tr>
              <td className='conference-details-category'>Number of Schools</td>
              <td className='conference-details-item'>{conference.schools.length}</td>
            </tr>
            <tr>
              <td className='conference-details-category'>
                <span className="conference-details-color-square" style={{ backgroundColor: confColors[selectedConference].main }}></span>
                Avg. Distance Between Schools
              </td>
              <td className='conference-details-item'>{Math.round(conference.avgDistanceBetweenSchools)} miles</td>
            </tr>
            <tr>
              <td className='conference-details-category'>
                <span className="conference-details-color-square" style={{ backgroundColor: confColors[selectedConference].light }}></span>
                Avg. Distance from GeoCenter
              </td>
              <td className='conference-details-item'>{Math.round(conference.avgDistanceFromCenter)} miles</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    :
    <div className='conference-details'>
      <div className='conference-details-main'>
        <h3 className='conference-details-conference'>
          <span className='conference-details-category-header'>Conference:</span>
          <img className='conference-details-conference-img' src={confLogos[selectedConference]} />
        </h3>
        <h3 className='conference-details-year'>
          <span className='conference-details-category-header'>
            Year:
          </span>
          <span className='conference-details-category-header-year'>
            {selectedYear}
          </span>
        </h3>
      </div>
      <div className='chart-container'>
        {selectedYear < startYear ?
          <>
            <button className='out-of-range-button' onClick={() => setYear(startYear)}>
              <p>Conference does not exist yet.</p>
              <p>Jump to {startYear}</p>
            </button>
          </>
          :
          <>
            <button className='out-of-range-button' onClick={() => setYear(endYear)}>
              <p>Conference does not exist yet.</p>
              <p>Jump to {endYear}</p>
            </button>
          </>
        }
      </div>
    </div>
  )
};

export default App