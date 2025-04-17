'use strict';

let initialized = false;
let allTrophies = [];
let currentConsole = 'all';
const entriesPerPage = 50;
let currentPage = 1;
let sortColumn = null;
let sortOrder = 'asc';

const SORT_ASC = 'asc';
const SORT_DESC = 'desc';

async function loadTrophies() {
    try {
        const response = await fetch('all.json.gz');
        if (!response.ok) throw new Error('Failed to load all.json.gz');
        
        const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
        const text = await new Response(stream).text();
        
        const data = JSON.parse(text);
        console.log(data);

        for (const gameId in data) {
            const gameData = data[gameId];
            const isPS5 = gameData.pt.toLowerCase().includes('ps5');
            const isSample = gameId === 'NPWR20790';

            if (Array.isArray(gameData.tr)) {
                allTrophies.push({
                    npCommunicationId: gameId,
                    title: gameData.tt,
                    platform: gameData.pt,
                    trophySetVersion: gameData.v,
                    totalItemCount: gameData.c,
                    iconKey: gameData.ik,
                    isPS5: isPS5,
                    isSample: isSample,
                    trophies: gameData.tr.map(trophy => ({
                        ...trophy,
                        iconPattern: isPS5 ? 'ps5' : 'legacy'
                    }))
                });
            }
        }

        renderPagination();
        renderTable();
    } catch (error) {
        console.error('Error loading trophies:', error);
    } finally {
        document.getElementById('loading_progress').classList.add('d-none');
        document.getElementById('table_container').classList.remove('d-none');
    }
}

const trophyTypeImages = {
    p: 'img/platinum.png',
    g: 'img/gold.png',
    s: 'img/silver.png',
    b: 'img/bronze.png',
};

function getTrophyTypeImage(type) {
    const imagePath = trophyTypeImages[type.toLowerCase()];
    return imagePath
}

function renderTable() {
    const tbody = document.querySelector('#table tbody');
    tbody.innerHTML = '';
    
    let filteredGames = filterGames();
    if (sortColumn) {
        filteredGames = sortGames(filteredGames);
    }
    
    const start = (currentPage - 1) * entriesPerPage;
    const end = start + entriesPerPage;
    const gamesToDisplay = filteredGames.slice(start, end);
    
    gamesToDisplay.forEach(game => {
        const row = document.createElement('tr');
        row.classList.add('game-summary-row');
        row.setAttribute('data-npCommunicationId', game.npCommunicationId);
        
        row.innerHTML = `
            <td>${game.npCommunicationId}</td>
            <td>${game.title}</td>
            <td>${game.totalItemCount}</td>
            <td>${game.trophySetVersion}</td>
            <td>${game.platform}</td>
        `;
        
        tbody.appendChild(row);
        
        const trophyDetailRow = document.createElement('tr');
        trophyDetailRow.classList.add('trophy-detail-row');
        trophyDetailRow.setAttribute('data-npCommunicationId', game.npCommunicationId);
        trophyDetailRow.style.display = 'none';

        const detailCell = document.createElement('td');
        detailCell.colSpan = 5;
        detailCell.classList.add('trophy-details-cell');

        const trophyDetailsTable = document.createElement('table');
        trophyDetailsTable.classList.add('table', 'table-sm', 'table-striped');

        const trophyDetailsTbody = document.createElement('tbody');

        const headerRow = document.createElement('tr');
        headerRow.innerHTML = `
            <th>Type</th>
            <th>Name</th>
            <th>Details</th>
            <th>Hidden</th>
            <th>Icon</th>
        `;
        trophyDetailsTbody.appendChild(headerRow);

        game.trophies.forEach(trophy => {
            const trophyRow = document.createElement('tr');
            const trophyTypeImage = getTrophyTypeImage(trophy.t);
            
            let iconUrl = '';
            if (trophy.i) {
                if (game.isSample) {
                    iconUrl = trophy.i;
                } else if (game.isPS5) {
                    iconUrl = `https://psnobj.prod.dl.playstation.net/psnobj/${game.npCommunicationId}_00/${trophy.i}`;
                } else if (game.iconKey) {
                    iconUrl = `https://image.api.playstation.com/trophy/np/${game.iconKey}/${trophy.i}`;
                }
            }

            const isHidden = trophy.h === 1 ? 'Yes' : 'No';

            trophyRow.innerHTML = `
                <td><img src="${trophyTypeImage}" alt="${trophy.t}" class="trophy-image" /></td>
                <td>${trophy.n}</td>
                <td>${trophy.d}</td>
                <td>${isHidden}</td>
                <td>
                    <img data-src="${iconUrl}" class="trophy-icon lazyload" alt="${trophy.n}" 
                         onerror="this.onerror=null;this.src='img/trophy_placeholder.png'">
                </td>
            `;
            trophyDetailsTbody.appendChild(trophyRow);
        });

        trophyDetailsTable.appendChild(trophyDetailsTbody);
        detailCell.appendChild(trophyDetailsTable);
        trophyDetailRow.appendChild(detailCell);

        tbody.appendChild(trophyDetailRow);

        row.addEventListener('click', () => {
            const currentRow = row.nextElementSibling;
            if (currentRow.style.display === 'none') {
                currentRow.style.display = 'table-row';
                loadTrophyIcons(currentRow);
            } else {
                currentRow.style.display = 'none';
            }
        });
    });

    document.getElementById('trophy_count').textContent = `Showing ${start + 1}-${Math.min(end, filteredGames.length)} of ${filteredGames.length} games`;
}

function loadTrophyIcons(trophyDetailRow) {
    const images = trophyDetailRow.querySelectorAll('img.lazyload');
    images.forEach(img => {
        if (img.getAttribute('data-src') && !img.src) {
            img.src = img.getAttribute('data-src');
        }
    });
}

function groupTrophiesByGame(games) {
    return games.map(game => ({
        npCommunicationId: game.npCommunicationId,
        title: game.title,
        totalItemCount: game.totalItemCount,
        trophySetVersion: game.trophySetVersion,
        platform: game.platform,
        trophies: game.trophies
    }));
}

function renderPagination() {
    const pagination = document.getElementById('pagination');
    pagination.innerHTML = '';

    const filteredGames = filterGames();
    const totalPages = Math.ceil(filteredGames.length / entriesPerPage);

    const prevButton = document.createElement('button');
    prevButton.textContent = 'Previous';
    prevButton.className = 'btn btn-sm btn-primary me-2';
    prevButton.disabled = currentPage === 1;
    prevButton.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
            renderPagination();
        }
    });
    pagination.appendChild(prevButton);

    const pageInput = document.createElement('input');
    pageInput.type = 'number';
    pageInput.min = 1;
    pageInput.max = totalPages;
    pageInput.value = currentPage;
    pageInput.className = 'form-control form-control-sm d-inline w-auto';
    pageInput.addEventListener('change', (e) => {
        const newPage = parseInt(e.target.value);
        if (newPage >= 1 && newPage <= totalPages) {
            currentPage = newPage;
            renderTable();
            renderPagination();
        } else {
            pageInput.value = currentPage;
        }
    });
    pagination.appendChild(pageInput);

    const nextButton = document.createElement('button');
    nextButton.textContent = 'Next';
    nextButton.className = 'btn btn-sm btn-primary ms-2';
    nextButton.disabled = currentPage === totalPages;
    nextButton.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderTable();
            renderPagination();
        }
    });
    pagination.appendChild(nextButton);
}

function sortGames(games) {
    return games.sort((a, b) => {
        let aValue, bValue;
        
        if (sortColumn === 'title') {
            aValue = a.title;
            bValue = b.title;
        } else {
            aValue = a[sortColumn];
            bValue = b[sortColumn];
        }

        if (typeof aValue === 'string' && typeof bValue === 'string') {
            aValue = aValue.toLowerCase();
            bValue = bValue.toLowerCase();
        }

        return sortOrder === 'asc' ? (aValue > bValue ? 1 : -1) : (aValue < bValue ? 1 : -1);
    });
}

function filterGames() {
    const filterVal = document.getElementById('filter').value.toLowerCase();
    return allTrophies.filter(game => {
        const matchesConsole =
        currentConsole === 'all' ||
        game.platform.toLowerCase().split(',').includes(currentConsole.toLowerCase());
        const matchesFilter = `${game.title} ${game.platform} ${game.npCommunicationId}`.toLowerCase().includes(filterVal);
        return matchesConsole && matchesFilter;
    });
}

function scrollFunction() {
    if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
        document.getElementById("scrollToTopBtn").style.display = "block";
    } else {
        document.getElementById("scrollToTopBtn").style.display = "none";
    }
}

function scrollToTop() {
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
}

function toggleDarkMode() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-bs-theme') === 'dark';
    html.setAttribute('data-bs-theme', isDark ? 'light' : 'dark');
    localStorage.setItem('darkMode', !isDark);
    updateDarkModeIcon();
}

function updateDarkModeIcon() {
    const toggleBtn = document.getElementById('darkModeToggle');
    const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
    toggleBtn.innerHTML = isDark ? '<i class="bi bi-sun"></i>' : '<i class="bi bi-moon"></i>';
    toggleBtn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
}

function initializeDarkMode() {
    const savedMode = localStorage.getItem('darkMode');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedMode === 'true' || (savedMode === null && systemPrefersDark)) {
        document.documentElement.setAttribute('data-bs-theme', 'dark');
    }
    updateDarkModeIcon();
    
    document.getElementById('darkModeToggle').addEventListener('click', toggleDarkMode);
}

function updateActiveFilter() {
    document.querySelectorAll('.nav-link[data-console]').forEach(link => {
        link.classList.remove('active-filter');
    });

    const activeLink = document.querySelector(`.nav-link[data-console="${currentConsole}"]`);
    if (activeLink) {
        activeLink.classList.add('active-filter');
    }
}

document.addEventListener('DOMContentLoaded', init);

async function init() {
    if (!initialized) {
        initialized = true;
        initializeDarkMode();
        updateActiveFilter();
        await loadTrophies();

        document.querySelectorAll('.nav-link[data-console]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                currentConsole = link.getAttribute('data-console');
                currentPage = 1;
                updateActiveFilter();
                renderTable();
                renderPagination();
            });
        });

        const filterInput = document.getElementById('filter');
        filterInput.addEventListener('input', () => {
            currentPage = 1;
            renderTable();
            renderPagination();
        });

        const clearButton = document.getElementById('clear_button');
        clearButton.addEventListener('click', () => {
            filterInput.value = '';
            currentPage = 1;
            renderTable();
            renderPagination();
        });

        filterInput.addEventListener('input', () => {
            if (filterInput.value.trim()) {
                clearButton.classList.remove('d-none');
            } else {
                clearButton.classList.add('d-none');
            }
        });

        document.querySelectorAll('#table th').forEach((th, index) => {
            th.addEventListener('click', () => {
                const columns = ['npCommunicationId', 'title', 'totalItemCount', 'trophySetVersion', 'platform'];
                const column = columns[index];
                if (column) {
                    if (sortColumn === column) {
                        sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
                    } else {
                        sortColumn = column;
                        sortOrder = 'asc';
                    }
                    renderTable();
                }
            });
        });        

        window.onscroll = scrollFunction;
    }
}