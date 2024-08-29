document.addEventListener("DOMContentLoaded", async () => {
  const socket = io();
  const tasksContainer = document.getElementById("tasksContainer");
  const feedbackMessage = document.getElementById("feedbackMessage");
  const taskTemplate = document.getElementById("taskTemplate").content;

  let tasks = [];
  let isAllowed = false;

  try {
    const response = await fetch("/check-ip");
    const data = await response.json();
    isAllowed = data.allowed;
  } catch (error) {
    console.error("Failed to check IP allowance:", error);
  }

  const stateColors = {
    "To Do": "#42a5f5",
    "In Progress": "#ff6600",
    Done: "#66bb6a",
  };

  const states = ["To Do", "In Progress", "Done"];

  const customStates = [
    { name: "Minor", color: "#6c757d" }, // Gray
    { name: "Low", color: "#42a5f5" }, // Blue
    { name: "Normal", color: "#66bb6a" }, // Green
    { name: "Important", color: "#ffb74d" }, // Orange
    { name: "Urgent", color: "#ef5350" }, // Red with icon
  ];

  const fetchTasks = async () => {
    try {
      const response = await fetch("/tasks");
      const folderTasks = await response.json();
      const existingTasks = JSON.parse(localStorage.getItem("tasks")) || [];

      folderTasks.forEach((folderTask) => {
        const existingTask = existingTasks.find(
          (task) => task.id === folderTask.id
        );
        if (existingTask) {
          folderTask.state = existingTask.state;
          folderTask.completed = existingTask.completed;
          folderTask.customState = existingTask.customState || 0; // Default to 0 if not set
        }
      });

      tasks = [...folderTasks];
      localStorage.setItem("tasks", JSON.stringify(tasks));
      renderTasks();
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
      showFeedback("Failed to fetch tasks.", "error");
    }
  };

  const fetchTaskContents = async (folderName, parentPath = "") => {
    try {
      const encodedParentPath = parentPath
        ? encodeURIComponent(parentPath)
            .replace(/%252F/g, "%2F")
            .replace(/%2526/g, "%26") + // Handle '&' character encoding
          "/"
        : "";

      const encodedFolderName = encodeURIComponent(folderName)
        .replace(/%2520/g, "%20") // Handle spaces
        .replace(/%2526/g, "%26"); // Handle '&' character encoding
      const url = `/tasks/${encodedParentPath}${encodedFolderName}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch contents of ${folderName}: ${response.statusText}`
        );
      }
      const contents = await response.json();
      return contents;
    } catch (error) {
      console.error(`Failed to fetch contents of ${folderName}:`, error);
      showFeedback(`Failed to fetch contents of ${folderName}.`, "error");
      return [];
    }
  };

  const fetchAllSubfolders = async (baseFolder) => {
    const folders = [];

    const fetchSubfolders = async (folderPath) => {
      try {
        const contents = await fetchTaskContents(folderPath);

        for (const item of contents) {
          if (item.isFolder) {
            const fullPath = `${folderPath}/${encodeURIComponent(item.name)}`;
            folders.push(fullPath);
            await fetchSubfolders(fullPath);
          }
        }
      } catch (error) {
        console.error(`Failed to fetch contents of ${folderPath}:`, error);
      }
    };

    await fetchSubfolders(baseFolder);
    return folders;
  };

  const renderTasks = () => {
    tasksContainer.innerHTML = "";
    const categorizedTasks = tasks.reduce((acc, task) => {
      if (task.id) {
        acc[task.category] = acc[task.category] || [];
        acc[task.category].push(task);
      }
      return acc;
    }, {});

    for (const category in categorizedTasks) {
      const categorySection = document.createElement("div");
      categorySection.classList.add("category");
      categorySection.innerHTML = `<h2>${category}</h2>`;
      categorizedTasks[category].forEach((task) => {
        const taskElement = taskTemplate.cloneNode(true);
        const taskDiv = taskElement.querySelector(".task");
        const stateButton = taskElement.querySelector(".state-btn");
        const moveButton = taskElement.querySelector(".move-btn");
        const showContentsButton = taskElement.querySelector(".showContents");
        const contentsList = taskElement.querySelector(".contents");
        const uploadContainer = taskElement.querySelector(".uploadContainer");
        const notesContainer = taskElement.querySelector(".notesContainer");
        const notesInput = taskElement.querySelector(".notesInput");
        const saveNotesButton = taskElement.querySelector(".saveNotes");
        const clearNotesButton = taskElement.querySelector(".clearNotes");
        const rotateStateButton =
          taskElement.querySelector("#rotateStateButton");

        // Ensure state is defined and defaults to 'To Do'
        task.state = task.state || "To Do";
        task.customState = task.customState || 0;

        // Set task class and state colors
        taskDiv.classList.add(task.state.toLowerCase().replace(" ", "-"));
        if (task.completed) {
          taskDiv.classList.add("completed");
        }

        // Set task description and state button text
        taskDiv.querySelector("span").textContent = task.description;
        stateButton.textContent = task.state;
        stateButton.style.backgroundColor = stateColors[task.state];
        stateButton.style.borderColor = stateColors[task.state];

        if (!isAllowed) {
          moveButton.style.display = "none";
          clearNotesButton.style.display = "none";
        }

        if (rotateStateButton) {
          // Set the button text and color based on the task's customState
          rotateStateButton.textContent = customStates[task.customState].name;
          rotateStateButton.style.backgroundColor =
            customStates[task.customState].color;

          // Event listener for the rotate state button
          rotateStateButton.addEventListener("click", () => {
            if (isAllowed) {
              task.customState = (task.customState + 1) % customStates.length;
              rotateStateButton.textContent =
                customStates[task.customState].name;
              rotateStateButton.style.backgroundColor =
                customStates[task.customState].color;

              // Save the updated tasks to localStorage
              localStorage.setItem("tasks", JSON.stringify(tasks));
              socket.emit("taskUpdate", task); // Update server if necessary
            } else {
              alert("You do not have permission to change the state.");
            }
          });
        } else {
          console.error(
            "Rotate state button element is missing in the task template."
          );
        }

        // Event listener for the state button
        stateButton.addEventListener("click", () => {
          toggleState(task.id);
      });

        // Event listener for the move button
        moveButton.addEventListener("click", () => {
          if (task.state !== "Done") {
            showFeedback(
              "Move is not allowed before the status is Done.",
              "error"
            );
          } else {
            moveTask(task.id);
          }
        });

        // Event listener for the showContents button
        showContentsButton.addEventListener("click", async (event) => {
          if (contentsList.classList.contains("hidden")) {
            const contents = await fetchTaskContents(task.id);
            contentsList.innerHTML = contents
              .map((item) => {
                if (item.isFolder) {
                  return `
                                        <li class="folder-item">
                                            <strong class="folder-toggle">${item.name}</strong>
                                            <ul class="subfolder-contents hidden"></ul>
                                        </li>
                                    `;
                } else {
                  return `<li><a href="/tasks/${encodeURIComponent(
                    task.id
                  )}/${encodeURIComponent(item.name)}" target="_blank">${
                    item.name
                  }</a></li>`;
                }
              })
              .join("");

            contentsList.classList.remove("hidden");
            uploadContainer.classList.remove("hidden");
            notesContainer.classList.remove("hidden");

            // Fetch and display notes
            const notesResponse = await fetch(
              `/tasks/${encodeURIComponent(task.id)}/notes`
            );
            if (notesResponse.ok) {
              const notesText = await notesResponse.text();
              notesInput.value = notesText;
            }

            // Populate the folder selection dropdown with all subfolders
            const folderSelect = uploadContainer.querySelector(".folderSelect");
            await populateFolderSelect(folderSelect, task.id);

            showContentsButton.textContent = "Hide Contents";

            // Add event listeners to folder toggles
            addFolderToggleListeners(contentsList, task.id);
          } else {
            contentsList.classList.add("hidden");
            uploadContainer.classList.add("hidden");
            notesContainer.classList.add("hidden");
            showContentsButton.textContent = "Show Contents";
          }
        });

        

        // Event listener for the upload form
        const uploadForm = uploadContainer.querySelector(".uploadForm");
        uploadForm.addEventListener("submit", async (event) => {
          event.preventDefault(); // Prevent default form submission behavior

          const formData = new FormData(uploadForm);
          const selectedFolder =
            uploadContainer.querySelector(".folderSelect").value; // Get selected folder path

          try {
            let response = await fetch(
              `/tasks/${encodeURIComponent(selectedFolder)}/upload`,
              {
                method: "POST",
                body: formData,
              }
            );

            if (response.status === 409) {
              // File already exists
              const overwrite = confirm(
                "File already exists. Do you want to overwrite it?"
              );
              if (overwrite) {
                // Add a flag to indicate overwriting
                formData.append("overwrite", true);
                // Retry the upload with the overwrite flag
                response = await fetch(
                  `/tasks/${encodeURIComponent(selectedFolder)}/upload`,
                  {
                    method: "POST",
                    body: formData,
                  }
                );
              } else {
                showFeedback("File upload canceled.", "info");
                return;
              }
            }

            const result = await response.json();

            if (result.success) {
              showFeedback(
                `File "${result.file}" uploaded successfully to ${selectedFolder}.`,
                "success"
              );
              socket.emit("taskUpdate", { id: task.id });
            } else {
              showFeedback("Failed to upload file.", "error");
            }
          } catch (error) {
            console.error("File upload error:", error);
            showFeedback("Failed to upload file.", "error");
          }
        });

        async function populateFolderSelect(selectElement, parentPath) {
          selectElement.innerHTML = ""; // Clear existing options
          const defaultOption = document.createElement("option");
          defaultOption.value = parentPath;
          defaultOption.text = "Root Folder";
          selectElement.appendChild(defaultOption);

          const allSubfolders = await fetchAllSubfolders(parentPath);

          allSubfolders.forEach((fullPath) => {
            const option = document.createElement("option");
            option.value = fullPath;
            option.text = fullPath
              .replace(`${encodeURIComponent(parentPath)}/`, "")
              .replace(/%20/g, " "); // Show relative path
            selectElement.appendChild(option);
          });
        }

        function addFolderToggleListeners(parentElement, parentPath) {
          parentElement.querySelectorAll(".folder-toggle").forEach((toggle) => {
            toggle.addEventListener("click", async () => {
              const subfolderContents = toggle.nextElementSibling;
              const folderName = toggle.textContent
                .trim()
                .replace(" (Click to collapse)", "");

              if (subfolderContents.classList.contains("hidden")) {
                if (!subfolderContents.hasChildNodes()) {
                  const fullPath = parentPath
                    ? `${parentPath}/${encodeURIComponent(folderName)}`
                    : encodeURIComponent(folderName);
                  const subfolderItems = await fetchTaskContents(fullPath);

                  if (Array.isArray(subfolderItems)) {
                    subfolderContents.innerHTML = subfolderItems
                      .map((subItem) => {
                        return subItem.isFolder
                          ? `<li class="folder-item"><strong class="folder-toggle">${subItem.name}</strong><ul class="subfolder-contents hidden"></ul></li>`
                          : `<li><a href="/tasks/${fullPath}/${encodeURIComponent(
                              subItem.name
                            )}" target="_blank">${subItem.name}</a></li>`;
                      })
                      .join("");
                    addFolderToggleListeners(subfolderContents, fullPath); // Recursively add listeners for nested subfolders
                  } else {
                    console.error("Unexpected data format:", subfolderItems);
                    showFeedback(
                      "Unexpected data format received from server.",
                      "error"
                    );
                  }
                }
                subfolderContents.classList.remove("hidden");
                toggle.textContent = `${folderName} (Click to collapse)`;
              } else {
                subfolderContents.classList.add("hidden");
                toggle.textContent = folderName;
              }
            });
          });
        }

        // Event listener for the save notes button
        saveNotesButton.addEventListener("click", async () => {
          const notes = notesInput.value.trim();
          if (!notes) {
            showFeedback("Cannot save empty notes.", "error");
            return;
          }

          try {
            const response = await fetch(
              `/tasks/${encodeURIComponent(task.id)}/notes`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ notes, user: "YourUsername" }), // Pass the current user's name
              }
            );
            const result = await response.json();
            if (result.success) {
              showFeedback("Notes saved successfully.", "success");
              socket.emit("taskUpdate", { id: task.id });

              // Collapse the contents list after saving notes
              contentsList.classList.add("hidden");
              uploadContainer.classList.add("hidden");
              notesContainer.classList.add("hidden");
              showContentsButton.textContent = "Show Contents";
            } else {
              showFeedback("Failed to save notes.", "error");
            }
          } catch (error) {
            console.error("Error saving notes:", error);
            showFeedback("Failed to save notes.", "error");
          }
        });

        clearNotesButton.addEventListener("click", async () => {
          if (
            confirm(
              "Are you sure you want to clear all notes? This action cannot be undone."
            )
          ) {
            try {
              const response = await fetch(
                `/tasks/${encodeURIComponent(task.id)}/notes`,
                {
                  method: "DELETE",
                }
              );
              const result = await response.json();
              if (result.success) {
                notesInput.value = ""; // Clear the textarea in the UI
                showFeedback("Notes cleared successfully.", "success");
                socket.emit("taskUpdate", { id: task.id });
              } else {
                showFeedback("Failed to clear notes.", "error");
              }
            } catch (error) {
              console.error("Error clearing notes:", error);
              showFeedback("Failed to clear notes.", "error");
            }
          }
        });

        categorySection.appendChild(taskElement);
      });
      tasksContainer.appendChild(categorySection);
    }
  };

  const showFeedback = (message, type) => {
    feedbackMessage.textContent = message;
    feedbackMessage.className = `feedbackMessage ${type}`;
    feedbackMessage.classList.add("visible");
    setTimeout(() => {
      feedbackMessage.classList.remove("visible");
    }, 3000);
  };

  const toggleState = (id) => {
    const task = tasks.find((task) => task.id === id);
    if (task && task.state !== "Done") {
      const currentIndex = states.indexOf(task.state);
      task.state = states[(currentIndex + 1) % states.length];
      localStorage.setItem("tasks", JSON.stringify(tasks));
      renderTasks();
      socket.emit("taskUpdate", task);
    }
  };

  const moveTask = async (id) => {
    try {
      const response = await fetch(`/tasks/${encodeURIComponent(id)}/move`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to move task.");
      }

      // Remove task from local state and update UI
      tasks = tasks.filter((task) => task.id !== id);
      localStorage.setItem("tasks", JSON.stringify(tasks));
      renderTasks();

      // Notify server about the move
      socket.emit("taskUpdate", { id, moved: true });

      showFeedback("Task moved successfully!", "success");
    } catch (error) {
      console.error("Error moving task:", error);
      showFeedback("Failed to move task.", "error");
    }
  };

  socket.on("taskUpdate", (task) => {
    const existingTask = tasks.find((t) => t.id === task.id);
    if (existingTask) {
      Object.assign(existingTask, task);
    } else {
      tasks.push(task);
    }

    // Save the current collapse state
    const contentsList = document.querySelector(".contents");
    const uploadContainer = document.querySelector(".uploadContainer");
    const notesContainer = document.querySelector(".notesContainer");
    const showContentsButton = document.querySelector(".showContents");

    const wasContentVisible = !contentsList.classList.contains("hidden");

    fetchTasks(); // Re-fetch tasks to update the UI
    renderTasks();

    // Restore the collapse state after re-rendering
    if (wasContentVisible) {
      contentsList.classList.remove("hidden");
      uploadContainer.classList.remove("hidden");
      notesContainer.classList.remove("hidden");
      showContentsButton.textContent = "Hide Contents";
    }
  });

  // Initial task fetch
  fetchTasks();
});
