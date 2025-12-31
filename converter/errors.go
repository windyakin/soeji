package main

import "fmt"

type NotFoundError struct {
	Path string
}

func (e *NotFoundError) Error() string {
	return fmt.Sprintf("image not found: %s", e.Path)
}
